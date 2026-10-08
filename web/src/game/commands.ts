import { z } from "zod";
import { RuleError } from "./errors";

const actorId = z.string().min(1).max(64);
const targetId = z.string().min(1).max(64).nullable();
const simple = <T extends string>(type: T) => z.strictObject({ type: z.literal(type), actorId });
const targeted = <T extends string>(type: T) => z.strictObject({ type: z.literal(type), actorId, targetId });
const schema = z.discriminatedUnion("type", [
  simple("deal"), simple("acknowledge"), simple("begin_night"),
  simple("open_window"), simple("close_window"), simple("finish_role"), simple("publish_dawn"),
  simple("pause"), simple("resume"), simple("abort"), simple("restart"),
  simple("open_hunter_window"), simple("close_hunter_window"),
  targeted("guard"), targeted("wolf_propose"), simple("wolf_confirm"), targeted("seer"),
  z.strictObject({ type: z.literal("witch"), actorId, choice: z.enum(["save", "poison", "pass"]), targetId }),
  targeted("day_draft"), simple("day_confirm"), simple("day_publish"), targeted("hunter"),
]);
export type Command = z.infer<typeof schema>;

export function parseCommand(input: unknown): Command {
  const result = schema.safeParse(input);
  if (!result.success) throw new RuleError("COMMAND_INVALID");
  return result.data;
}
