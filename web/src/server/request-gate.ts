import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { requireRule } from "../game/errors";

// A bounded, instance-local filter runs before database-backed limits. It is not a distributed DDoS shield.
export class RequestGate {
  private readonly buckets = new Map<string, { expires: number; count: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  check(request: Request, kind: "api" | "health" = "api") {
    if (process.env.VERCEL !== "1") return;
    const supplied = request.headers.get("x-vercel-forwarded-for") ?? "";
    const address = isIP(supplied) ? supplied : "unknown";
    const key = `${kind}:${createHash("sha256").update(address).digest("hex")}`;
    const now = this.now(); const prior = this.buckets.get(key);
    if (prior && prior.expires > now) {
      requireRule(prior.count < (kind === "health" ? 60 : 2400), "RATE_LIMITED");
      prior.count++; return;
    }
    if (!prior && this.buckets.size >= 2048) {
      for (const [id, bucket] of this.buckets) if (bucket.expires <= now) this.buckets.delete(id);
      requireRule(this.buckets.size < 2048, "RATE_LIMITED");
    }
    this.buckets.set(key, { expires: now + 60_000, count: 1 });
  }
}

export const requestGate = new RequestGate();
