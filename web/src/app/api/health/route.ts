import { RULES_VERSION } from "../../../game/config";
import { openStorage, reportServerFailure } from "../../../server/storage-runtime";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export async function GET() {
  const startedAt = Date.now();
  if (process.env.WEREWOLF_MAINTENANCE === "1") return Response.json({ status: "maintenance" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let storage: ReturnType<typeof openStorage> | undefined;
  try {
    storage = openStorage(); await storage.ready();
    return Response.json({ status: "ok", rulesVersion: RULES_VERSION }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    reportServerFailure("database_not_ready", startedAt);
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { storage?.close(); }
}
