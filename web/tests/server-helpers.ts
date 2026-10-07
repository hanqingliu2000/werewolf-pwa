import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SqliteRoomStore } from "../src/server/store";
import { RoomService, mintSession } from "../src/server/service";
import type { Mutation } from "../src/server/input";
import { epochId } from "../src/server/views";
import { config, fixedRandom } from "./helpers";
import type { RuleConfig } from "../src/game/types";

export function fixture(count = 8, rules: RuleConfig = config) {
  const directory = mkdtempSync(join(tmpdir(), "werewolf-service-"));
  const path = join(directory, "rooms.sqlite");
  const store = new SqliteRoomStore(path);
  const time = { now: 10_000 };
  const service = new RoomService(store, () => time.now, fixedRandom);
  const tokens = Array.from({ length: count }, mintSession);
  const created = service.create(tokens[0]!, { requestId: randomUUID(), name: "Player 1", config: rules });
  for (let i = 1; i < count; i++) service.join(created.roomId, tokens[i]!, { requestId: randomUUID(), epochId: created.epochId, name: `Player ${i + 1}` });
  const id = created.roomId;
  const state = () => store.load(id)!.room;
  const envelope = (operation: Mutation["operation"]) => ({ requestId: randomUUID(), epochId: epochId(state()), windowId: state().flowId, operation });
  const act = (operation: Mutation["operation"], index = 0) => service.mutate(id, tokens[index]!, envelope(operation));
  const start = () => {
    for (let i = 0; i < count; i++) act({ type: "ready", ready: true }, i);
    act({ type: "start" });
  };
  const begin = () => {
    start();
    for (let i = 0; i < count; i++) act({ type: "acknowledge" }, i);
    act({ type: "begin_night" });
  };
  const advance = () => {
    const deadline = state().game!.window!.deadline;
    time.now = deadline - 1;
    service.heartbeat(id, tokens[0]!, { foreground: true, audioReady: true });
    time.now = deadline;
    service.view(id, tokens[0]!);
  };
  const patch = (change: (room: ReturnType<typeof state>) => void) => {
    const record = store.load(id)!;
    change(record.room);
    store.compareAndSwap(record.room, record.version);
  };
  return { directory, path, store, time, service, tokens, id, state, envelope, act, start, begin, advance, patch,
    close: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
