import { RULES_VERSION } from "../../../game/config";
import { openStorage, reportServerFailure } from "../../../server/storage-runtime";
import { requestGate } from "../../../server/request-gate";
import { RuleError } from "../../../game/errors";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export async function GET(request: Request = new Request("http://localhost/api/health")) {
  const startedAt = Date.now();
  if (process.env.WEREWOLF_MAINTENANCE === "1") return Response.json({ status: "maintenance" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let storage: ReturnType<typeof openStorage> | undefined;
  try {
    requestGate.check(request, "health");
    storage = openStorage(); await storage.ready();
    return Response.json({ status: "ok", rulesVersion: RULES_VERSION }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RuleError && error.code === "RATE_LIMITED") return Response.json({ status: "rate_limited" }, {
      status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
    reportServerFailure("database_not_ready", startedAt);
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { storage?.close(); }
}
