import { createMachine, transition } from "xstate";
import { requireRule } from "./errors";
import type { Phase } from "./types";

const machine = createMachine({
  id: "game",
  initial: "lobby",
  states: {
    lobby: { on: { DEAL: "reveal" } },
    reveal: { on: { BEGIN_NIGHT: "night_open", ABORT: "end" } },
    night_open: { on: { OPEN: "night_action", ABORT: "end" } },
    night_action: { on: { CLOSE: "night_close", ABORT: "end" } },
    night_close: { on: { NEXT_ROLE: "night_open", RESOLVE: "dawn", ABORT: "end" } },
    dawn: { on: { HUNTER: "hunter", DAY: "day", FINISH: "end", ABORT: "end" } },
    hunter: { on: { DAY: "day", BEGIN_NIGHT: "night_open", FINISH: "end", ABORT: "end" } },
    day: { on: { HUNTER: "hunter", BEGIN_NIGHT: "night_open", FINISH: "end", ABORT: "end" } },
    end: { on: { RESTART: "lobby" } },
  },
});

export type PhaseEvent = "DEAL" | "BEGIN_NIGHT" | "OPEN" | "CLOSE" | "NEXT_ROLE" | "RESOLVE" | "HUNTER" | "DAY" | "FINISH" | "ABORT" | "RESTART";

export function movePhase(phase: Phase, type: PhaseEvent): Phase {
  const snapshot = machine.resolveState({ value: phase, context: {} });
  requireRule(snapshot.can({ type }), "PHASE_MISMATCH");
  const [next] = transition(machine, snapshot, { type });
  return next.value as Phase;
}
