import { readFileSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";

// Secret payloads are private files, never command arguments or logs. Only web-v2 is targeted.
const [credentialsPath, host, caPath] = process.argv.slice(2);
if (!credentialsPath || !host || !caPath) throw new Error("Usage: node scripts/configure-cloud.mjs <private-credentials.json> <pooler-host> <root-ca.pem>");
if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) throw new Error("Invalid pooler hostname");
if ((statSync(credentialsPath).mode & 0o077) !== 0) throw new Error("Credential file must be restricted to its owner");
const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
const ca = readFileSync(caPath, "utf8");
if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error("Root certificate is required");
const root = resolve(import.meta.dirname, "../..");
const project = JSON.parse(readFileSync(resolve(root, ".vercel/project.json"), "utf8"));
if (project.projectId !== "prj_pw1MiSa05HR43JzYQxcbQNW03UDh" || project.orgId !== "team_74cIgMAuIRb8tSwVxexuoDtt") throw new Error("Not linked to the approved web-v2 project");

for (const [target, schema, password] of [["preview", "werewolf_preview", credentials.preview_password], ["production", "werewolf_prod", credentials.production_password]]) {
  if (!/^[a-f0-9]{64}$/.test(password ?? "")) throw new Error("Invalid application credential");
  const url = new URL(`postgresql://${host}:6543/postgres`);
  url.username = `${schema}_app.knkrwuquthqblnkoxdtn`; url.password = password;
  const pool = new Pool({ connectionString: url.toString(), max: 1, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 5000, query_timeout: 10_000 });
  try {
    const { rows } = await pool.query("SELECT current_user AS role");
    if (rows[0].role !== `${schema}_app`) throw new Error("Wrong database role");
    await pool.query(`SELECT id FROM ${schema}.rooms LIMIT 1`);
    const foreign = schema === "werewolf_prod" ? "werewolf_preview" : "werewolf_prod";
    const access = await pool.query("SELECT has_schema_privilege(current_user, $1, 'USAGE') AS allowed", [foreign]);
    if (access.rows[0].allowed) throw new Error("Environment isolation failed");
  } catch { throw new Error(`Database/TLS verification failed for ${target}; no environment values changed for this target`); }
  finally { await pool.end(); }
  const values = [["WEREWOLF_STORAGE", "postgres", false], ["WEREWOLF_SCHEMA", schema, false],
    ["WEREWOLF_DATABASE_URL", url.toString(), true], ["WEREWOLF_DATABASE_CA", ca, true],
    ...(target === "production" ? [["WEREWOLF_ORIGIN", "https://werewolf-web-v2.vercel.app", false]] : [])];
  const payloadPath = resolve(dirname(credentialsPath), `vercel-${target}-payload.json`);
  try {
    for (const [key, value, secret] of values) {
      writeFileSync(payloadPath, JSON.stringify({ key, value, target: [target], type: secret ? "sensitive" : "plain" }), { mode: 0o600 });
      const result = spawnSync("vercel", ["api", "/v10/projects/werewolf-web-v2/env?upsert=true", "--method", "POST", "--input", payloadPath, "--header", "Content-Type: application/json",
        "--scope", "barrylius-projects-d58e2788", "--non-interactive", "--raw"], { cwd: root, encoding: "utf8" });
      if (result.status !== 0) {
        let detail = String(result.error?.code ?? `${result.stderr}\n${result.stdout}`);
        for (const privateValue of [url.toString(), credentials.preview_password, credentials.production_password, ca]) detail = detail.replaceAll(privateValue, "[REDACTED]");
        throw new Error(`Failed to configure ${key} in ${target}: ${detail.slice(0, 500)}`);
      }
      const response = JSON.parse(result.stdout);
      if (response.failed?.length || response.created?.key !== key || (secret && response.created.type !== "sensitive")) throw new Error(`Secret configuration could not be verified for ${key} in ${target}`);
    }
    console.log(`Verified ${target} configuration: ${values.length} keys, database URL and certificate stored as Secret`);
  } finally { unlinkSync(payloadPath); }
}
console.log("Verified both application roles and configured cloud environments. Production remains in maintenance until acceptance.");
