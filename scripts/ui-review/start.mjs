import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const directory = fileURLToPath(new URL("../../.local-generation/ui-review/", import.meta.url));
const runtimePath = `${directory}/runtime.json`;
const stopping = process.argv.includes("--stop");
async function health(url) { try { const result = await fetch(`${url}/__review/health`, { signal: AbortSignal.timeout(1500) }); return result.ok && (await result.json()).service === "werewolf-ui-review"; } catch { return false; } }
if (existsSync(runtimePath)) {
  const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  if (await health(runtime.url)) {
    if (stopping) {
      const response = await fetch(`${runtime.url}/__review/shutdown`, { method: "POST", headers: { "x-ui-review-stop": runtime.token } });
      if (!response.ok) throw new Error("The review service did not accept the stop request");
      unlinkSync(runtimePath); console.log("Temporary UI review stopped.");
    }
    else console.log(JSON.stringify({ url: runtime.url, reused: true }));
    process.exit(0);
  }
}
if (stopping) { console.log("No active UI review service."); process.exit(0); }
const upstream = process.env.UI_REVIEW_UPSTREAM ?? "http://127.0.0.1:3000";
const upstreamUrl = new URL(upstream);
if (upstreamUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(upstreamUrl.hostname) || upstreamUrl.username || upstreamUrl.password) throw new Error("Only a loopback app upstream is allowed");
const available = await fetch(upstream, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
if (!available?.ok) throw new Error("Start the local web app before the review service");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const token = randomUUID();
for (let port = Number(process.env.UI_REVIEW_PORT ?? 3010); port < Number(process.env.UI_REVIEW_PORT ?? 3010) + 10; port++) {
  const url = `http://127.0.0.1:${port}`;
  const probe = await fetch(`${url}/__review/health`, { signal: AbortSignal.timeout(200) }).catch(() => null);
  if (probe) continue;
  const output = openSync(`${directory}/service.log`, "a", 0o600);
  const child = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], { detached: true, stdio: ["ignore", output, output],
    env: { ...process.env, UI_REVIEW_PORT: String(port), UI_REVIEW_UPSTREAM: upstream, UI_REVIEW_STOP_TOKEN: token } });
  let exited = false; child.once("exit", () => { exited = true; });
  closeSync(output); child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    if (exited) break;
    if (await health(url)) { writeFileSync(runtimePath, JSON.stringify({ url, pid: child.pid, upstream, token }), { mode: 0o600 }); console.log(JSON.stringify({ url, scenes: 14, upstream })); process.exit(0); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!exited) child.kill();
}
throw new Error("No free local review port was found");
