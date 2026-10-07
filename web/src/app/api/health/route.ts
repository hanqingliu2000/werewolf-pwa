import { RULES_VERSION } from "../../../game/config";

export const runtime = "nodejs";

export function GET() {
  return Response.json({ status: "ok", rulesVersion: RULES_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
