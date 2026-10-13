import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../web/node_modules/typescript/lib/typescript.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const json = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
  .toString().split("\0").filter(path => path && existsSync(resolve(root, path)));
const unique = [...new Set(files)];
const sha256 = data => createHash("sha256").update(data).digest("hex");

for (const path of unique) {
  const name = path.split("/").at(-1);
  assert(!/(^|\/)(?:\.local-generation|\.local-archive|\.vercel|\.data|node_modules|test-results|coverage|hf-cache|__pycache__|\.venv|venv)(\/|$)/.test(path), `Private/generated directory: ${path}`);
  assert(!/^\.env(?:\.|$)/.test(name) || name === ".env.example", `Environment file: ${path}`);
  assert(!/\.(?:(?:sqlite|db)(?:-.+)?|key|pem|p12|pfx|log|dump|backup|py[co]|safetensors|gguf)$/.test(name), `Private file type: ${path}`);
  assert(!path.endsWith(".sql") || path.startsWith("supabase/migrations/"), `SQL export outside migrations: ${path}`);
  assert(!["app-credentials.json", "preview-auth.json"].includes(name), `Credential file: ${path}`);
  if (!path.endsWith(".md")) continue;
  const text = readFileSync(resolve(root, path), "utf8");
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split(/\s+"/)[0];
    if (/^(?:[a-z]+:|#)/i.test(target)) continue;
    const file = decodeURIComponent(target.split(/[?#]/)[0]);
    assert(file && existsSync(resolve(root, dirname(path), file)), `Broken documentation link: ${path} -> ${target}`);
  }
}

const script = json("web/src/narration/script.json"), voice = json("web/src/narration/voice.json");
assert.match(script.version, /^host-zh-v[1-9][0-9]*$/, "Invalid bank directory name");
assert.equal(script.version, voice.version, "Narration versions disagree");
assert.deepEqual(readdirSync(resolve(root, "web/public/audio")), [script.version], "Only the active bank may ship");
const bank = `web/public/audio/${script.version}`, manifest = json(`${bank}/manifest.json`);
assert.equal(manifest.version, script.version);
assert.equal(manifest.rulesVersion, script.rulesVersion);
assert.deepEqual(Object.keys(manifest.clips).sort(), Object.keys(script.clips).sort());
let audioFiles = 0;
for (const [id, text] of Object.entries(script.clips)) {
  for (const rate of [null, "1.5", "2"]) {
    const entry = rate ? manifest.rates[rate][id] : manifest.clips[id];
    const bytes = readFileSync(resolve(root, `${bank}/${rate ? `rates/${rate}/` : ""}${id}.mp3`));
    assert.equal(entry.text, text, `Clip text: ${id}`);
    assert.equal(entry.bytes, bytes.length, `Clip bytes: ${id}`);
    assert.equal(entry.sha256, sha256(bytes), `Clip fingerprint: ${id}`);
    audioFiles++;
  }
}

// Walk runtime imports from client entrypoints; type-only contracts do not enter the browser bundle.
const visited = new Set();
function checkClient(path) {
  if (visited.has(path)) return;
  visited.add(path);
  assert(!path.startsWith("web/src/server/") && path !== "web/src/game/engine.ts", `Server runtime in client graph: ${path}`);
  const source = readFileSync(resolve(root, path), "utf8");
  assert(!/process\.env\.NEXT_PUBLIC_\w*(?:DATABASE|PASSWORD|SECRET|TOKEN)/.test(source), `Public secret configuration: ${path}`);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
    } else if (node.isTypeOnly) continue;
    const name = node.moduleSpecifier.text;
    assert(!["pg", "node:sqlite", "node:fs", "node:fs/promises"].includes(name), `Private runtime import: ${path} -> ${name}`);
    if (!name.startsWith(".")) continue;
    const base = resolve(root, dirname(path), name);
    const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, resolve(base, "index.ts"), resolve(base, "index.tsx")]
      .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
    assert(target, `Unresolved client import: ${path} -> ${name}`);
    if (/\.tsx?$/.test(target)) checkClient(relative(root, target));
  }
}
for (const path of unique.filter(path => /^web\/src\/.+\.tsx?$/.test(path))) {
  if (/^["']use client["'];/.test(readFileSync(resolve(root, path), "utf8"))) checkClient(path);
}

const pkg = json("web/package.json"), lock = json("web/package-lock.json");
assert.equal(pkg.version, lock.version);
assert.equal(pkg.version, lock.packages[""].version);
const art = json("web/public/art/manifest.json");
for (const asset of art.assets) {
  const data = readFileSync(resolve(root, "web", asset.path));
  assert.equal(data.length, asset.bytes, `Art bytes: ${asset.name}`);
  assert.equal(sha256(data), asset.sha256, `Art fingerprint: ${asset.name}`);
}
console.log(JSON.stringify({ passed: true, files: unique.length, audioFiles, artwork: art.assets.length, clientModules: visited.size, version: pkg.version }));
