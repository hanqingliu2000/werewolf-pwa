import { resolve } from "node:path";
import { SqliteRoomStore } from "../../../../server/store";
import { RoomService } from "../../../../server/service";
import { createHttpHandler } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  let store: SqliteRoomStore | undefined;
  try {
    // Runtime data is not a build asset and must never be traced into deployment bundles.
    store = new SqliteRoomStore(resolve(/* turbopackIgnore: true */ process.env.WEREWOLF_DB_PATH ?? ".data/rooms.sqlite"));
    return await createHttpHandler(new RoomService(store), process.env.WEREWOLF_ORIGIN)(request);
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500,
      headers: { "Cache-Control": "private, no-store", "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } finally { store?.close(); }
}
export const GET = handle;
export const POST = handle;
