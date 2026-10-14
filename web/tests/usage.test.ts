import { expect, it } from "vitest";
import { fixture } from "./server-helpers";
import { usageSnapshot, changedUsage } from "../src/server/usage";

it("uses a stable legacy key without inventing creation or start times", async () => {
  const f = await fixture();
  try {
    await f.start();
    const legacy = structuredClone(f.state()); delete legacy.usage;
    const summary = usageSnapshot(legacy);
    expect(summary.room.id).toBe(legacy.lobbyId); expect(summary.room.createdAt).toBeNull();
    expect(summary.game!.startedAt).toBeNull(); expect(summary.room.isTest).toBe(false);
    const changed = structuredClone(legacy); changed.heartbeatAt += 1000;
    expect(changedUsage(changed, legacy)).toBeUndefined();
    changed.game!.phase = "end"; changed.game!.aborted = false;
    expect(usageSnapshot(changed).game).toMatchObject({ status: "completed", endedAt: changed.game!.updatedAt });
    expect(changedUsage(changed, legacy)).toBeDefined();
    changed.members[0]!.name = "Cloud QA test";
    expect(usageSnapshot(changed).room.isTest).toBe(true);
  } finally { f.close(); }
});
