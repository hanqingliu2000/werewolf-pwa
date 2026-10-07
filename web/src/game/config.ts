import { z } from "zod";
import { RuleError } from "./errors";
import { ROLES, type RuleConfig } from "./types";

export const RULES_VERSION = "werewolf-web-v1" as const;
const count = z.number().int().min(0).max(12);
const configSchema = z.strictObject({
  version: z.literal(RULES_VERSION),
  winMode: z.enum(["edge", "parity"]),
  roles: z.strictObject({
    werewolf: count, seer: count.max(1), witch: count.max(1),
    guard: count.max(1), hunter: count.max(1), villager: count,
  }),
}).superRefine(({ roles }, ctx) => {
  const total = ROLES.reduce((sum, role) => sum + roles[role], 0);
  const gods = roles.seer + roles.witch + roles.guard + roles.hunter;
  if (total < 8 || total > 12 || roles.werewolf < 1 || roles.werewolf > Math.floor(total / 3) || roles.villager < 1 || gods < 1) {
    ctx.addIssue({ code: "custom", message: "Unsupported role composition" });
  }
});

export function validateConfig(input: unknown, playerCount?: number): RuleConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) throw new RuleError("CONFIG_INVALID");
  const total = ROLES.reduce((sum, role) => sum + result.data.roles[role], 0);
  if (playerCount !== undefined && total !== playerCount) throw new RuleError("PLAYER_COUNT_MISMATCH");
  return result.data;
}

export function preset(playerCount: number, winMode: RuleConfig["winMode"] = "edge"): RuleConfig {
  if (![8, 9, 10, 11, 12].includes(playerCount)) throw new RuleError("CONFIG_INVALID");
  const wolves = playerCount === 8 ? 2 : playerCount === 12 ? 4 : 3;
  const hunter = playerCount >= 9 ? 1 : 0;
  const guard = playerCount >= 11 ? 1 : 0;
  return validateConfig({ version: RULES_VERSION, winMode, roles: {
    werewolf: wolves, seer: 1, witch: 1, guard, hunter,
    villager: playerCount - wolves - 2 - guard - hunter,
  } });
}
