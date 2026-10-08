import { readFileSync } from "node:fs";
import { Pool } from "pg";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";

const [credentialsPath, caPath, reportPath, target = "preview"] = process.argv.slice(2);
if (!["preview", "production"].includes(target) || !credentialsPath || !caPath || !reportPath) throw new Error("Provide credentials, certificate and the exact test-room report");
const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")); const report = JSON.parse(readFileSync(reportPath, "utf8"));
if (!Array.isArray(report.rooms) || !report.rooms.length || report.rooms.some(id => !/^[A-F0-9]{8}$/.test(id))) throw new Error("Exact test-room IDs are required");
if (!/^https:\/\/werewolf-web-v2(?:-[a-z0-9]+-barrylius-projects-d58e2788)?\.vercel\.app$/.test(report.origin)) throw new Error("Wrong test deployment origin");
const schema = target === "production" ? "werewolf_prod" : "werewolf_preview";
const url = new URL("postgresql://aws-0-us-east-1.pooler.supabase.com:6543/postgres");
url.username = `${schema}_app.knkrwuquthqblnkoxdtn`; url.password = target === "production" ? credentials.production_password : credentials.preview_password;
const pool = new Pool({ connectionString: url.toString(), max: 1, ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true }, connectionTimeoutMillis: 5000 });
try {
  const result = await pool.query(`DELETE FROM ${schema}.rooms WHERE id = ANY($1::text[])
    AND state->'members'->0->>'name' LIKE 'Cloud QA %' RETURNING id`, [report.rooms]);
  console.log(JSON.stringify({ deletedTestRooms: result.rowCount, schema }));
} finally { await pool.end(); }
