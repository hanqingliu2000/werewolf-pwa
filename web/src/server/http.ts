import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RuleError, requireRule } from "../game/errors";
import { hashSession, mintSession, type RoomService } from "./service";
import { reportServerFailure } from "./storage-runtime";

const MAX_BODY = 16_384;
const COOKIE = "ww_session";
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function token(request: NextRequest) {
  const result = tokenSchema.safeParse(request.cookies.get(COOKIE)?.value);
  return result.success ? result.data : null;
}

function origin(request: NextRequest, configuredOrigin?: string | readonly string[]) {
  const url = new URL(request.url);
  const allowed = typeof configuredOrigin === "string" ? [configuredOrigin] : configuredOrigin;
  const loopback = (value: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname);
  if (!configuredOrigin) requireRule(loopback(url), "ORIGIN_NOT_CONFIGURED");
  const declared = request.headers.get("origin");
  let sameOrigin = declared === url.origin;
  if (!sameOrigin && declared) {
    try {
      const source = new URL(declared);
      // NextURL canonicalizes loopback hosts; keep aliases bound to the configured Origin, scheme and port.
      sameOrigin = source.origin === declared && loopback(url) && loopback(source) && source.protocol === url.protocol && source.port === url.port;
    } catch { /* Malformed origins are rejected below. */ }
  }
  requireRule(sameOrigin && (!allowed || (declared !== null && allowed.includes(declared))), "ORIGIN_REJECTED");
  requireRule(!["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? ""), "ORIGIN_REJECTED");
}

async function body(request: NextRequest) {
  requireRule(request.headers.get("content-type")?.split(";")[0]?.trim() === "application/json", "CONTENT_TYPE_INVALID");
  const reader = request.body?.getReader();
  requireRule(reader, "INPUT_INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      requireRule(size <= MAX_BODY, "BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new RuleError("INPUT_INVALID"); }
}

function status(code: string) {
  if (code === "INVALID_SESSION") return 401;
  if (["FORBIDDEN", "ORIGIN_REJECTED", "ORIGIN_NOT_CONFIGURED"].includes(code)) return 403;
  if (code === "ROOM_UNAVAILABLE" || code === "ENDPOINT_NOT_FOUND") return 404;
  if (code === "RATE_LIMITED") return 429;
  if (code === "BODY_TOO_LARGE") return 413;
  if (code === "CONTENT_TYPE_INVALID") return 415;
  if (["INPUT_INVALID", "CONFIG_INVALID"].includes(code)) return 400;
  return 409;
}

export function createHttpHandler(service: RoomService, configuredOrigin?: string | readonly string[]) {
  return async function handle(raw: Request) {
    const startedAt = Date.now();
    const request = raw instanceof NextRequest ? raw : new NextRequest(raw);
    try {
      const parts = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
      if (request.method === "POST") origin(request, configuredOrigin);
      let session = token(request);
      if (parts.length === 1 && parts[0] === "session" && request.method === "POST") {
        const input = await body(request);
        requireRule(z.strictObject({}).safeParse(input).success, "INPUT_INVALID");
        await service.limit("session:global", 120);
        session ??= mintSession();
        const response = NextResponse.json({ ok: true }, { headers });
        response.cookies.set(COOKIE, session, { httpOnly: true, secure: new URL(request.url).protocol === "https:",
          sameSite: "strict", path: "/", maxAge: 7 * 24 * 60 * 60 });
        return response;
      }
      requireRule(session, "INVALID_SESSION");
      await service.limit(`http:${hashSession(session)}`, 240);
      if (parts[0] === "rooms" && parts.length === 1 && request.method === "POST") {
        return NextResponse.json(await service.create(session, await body(request)), { status: 201, headers });
      }
      requireRule(parts[0] === "rooms" && parts[1], "ENDPOINT_NOT_FOUND");
      const id = parts[1];
      if (parts.length === 3 && parts[2] === "invitation" && request.method === "GET") {
        return NextResponse.json(await service.invitation(id), { headers });
      }
      if (parts.length === 3 && parts[2] === "recaps" && request.method === "GET") {
        return NextResponse.json(await service.listRecaps(id, session), { headers });
      }
      if (parts.length === 2 && request.method === "GET") return NextResponse.json(await service.view(id, session), { headers });
      const action = parts[2];
      if (parts.length === 3 && request.method === "GET" && ["private", "host"].includes(action ?? "")) {
        return NextResponse.json(await service.view(id, session, action as "private" | "host"), { headers });
      }
      if (parts.length === 4 && action === "recaps" && request.method === "GET") {
        requireRule(z.string().uuid().safeParse(parts[3]).success, "INPUT_INVALID");
        return NextResponse.json(await service.readRecap(id, session, parts[3]!), { headers });
      }
      if (parts.length === 3 && request.method === "POST") {
        const input = await body(request);
        if (action === "join") return NextResponse.json(await service.join(id, session, input), { headers });
        if (action === "commands") return NextResponse.json(await service.mutate(id, session, input), { headers });
        if (action === "heartbeat") return NextResponse.json(await service.heartbeat(id, session, input), { headers });
      }
      throw new RuleError("ENDPOINT_NOT_FOUND");
    } catch (error) {
      const code = error instanceof RuleError ? error.code : "INTERNAL_ERROR";
      if (code === "INTERNAL_ERROR") reportServerFailure("api_internal_error", startedAt);
      return NextResponse.json({ error: { code } }, { status: code === "INTERNAL_ERROR" ? 500 : status(code),
        headers: { ...headers, ...(code === "RATE_LIMITED" ? { "Retry-After": "60" } : {}) } });
    }
  };
}
