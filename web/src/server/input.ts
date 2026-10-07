import { z } from "zod";
import { RuleError } from "../game/errors";

const id = z.string().uuid();
const targetId = z.string().min(1).max(64).nullable();
const name = z.string().trim().transform((value) => value.normalize("NFC"))
  .pipe(z.string().min(1).max(48).refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value)));
const simple = <T extends string>(type: T) => z.strictObject({ type: z.literal(type) });
const targeted = <T extends string>(type: T) => z.strictObject({ type: z.literal(type), targetId });
const operation = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready"), ready: z.boolean() }),
  z.strictObject({ type: z.literal("configure"), config: z.unknown() }),
  z.strictObject({ type: z.literal("seat"), seat: z.number().int().min(1).max(12) }),
  z.strictObject({ type: z.literal("rename"), name }),
  z.strictObject({ type: z.literal("kick"), playerId: id }), simple("leave"), simple("start"),
  simple("acknowledge"), simple("begin_night"), simple("cue_ack"),
  simple("pause"), simple("resume"), simple("abort"), simple("restart"),
  targeted("guard"), targeted("wolf_propose"), z.strictObject({ type: z.literal("wolf_confirm"), consensusId: id }), targeted("seer"),
  z.strictObject({ type: z.literal("witch"), choice: z.enum(["save", "poison", "pass"]), targetId }),
  targeted("day_draft"), z.strictObject({ type: z.literal("day_confirm"), draftId: id }),
  z.strictObject({ type: z.literal("day_publish"), draftId: id }), targeted("hunter"),
]);
const mutationSchema = z.strictObject({ requestId: id, epochId: id, windowId: id, operation });
const enrollmentSchema = z.strictObject({ requestId: id, name, config: z.unknown().optional() });
const joinSchema = z.strictObject({ requestId: id, epochId: id, name });
const heartbeatSchema = z.strictObject({ foreground: z.boolean(), audioReady: z.boolean() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new RuleError("INPUT_INVALID");
  return result.data;
}
export const parseMutation = (input: unknown) => parse(mutationSchema, input);
export const parseCreate = (input: unknown) => parse(enrollmentSchema, input);
export const parseJoin = (input: unknown) => parse(joinSchema, input);
export const parseHeartbeat = (input: unknown) => parse(heartbeatSchema, input);
export type Mutation = z.infer<typeof mutationSchema>;
