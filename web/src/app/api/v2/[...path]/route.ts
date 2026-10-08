import { openStorage, allowedOrigins, reportServerFailure } from "../../../../server/storage-runtime";
import { RoomService } from "../../../../server/service";
import { createHttpHandler } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  let storage: ReturnType<typeof openStorage> | undefined;
  const startedAt = Date.now();
  if (process.env.WEREWOLF_MAINTENANCE === "1") return Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" } });
  try {
    storage = openStorage();
    return await createHttpHandler(new RoomService(storage.store), allowedOrigins())(request);
  } catch {
    reportServerFailure("api_storage_failure", startedAt);
    return Response.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500,
      headers: { "Cache-Control": "private, no-store", "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } finally { storage?.close(); }
}
export const GET = handle;
export const POST = handle;
