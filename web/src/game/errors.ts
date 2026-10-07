export class RuleError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RuleError";
  }
}

export function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RuleError(code);
}
