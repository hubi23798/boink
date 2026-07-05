import { describe, it, expect } from "vitest";
import { redact } from "@/lib/logging/redact";

describe("redact", () => {
  it("masks access tokens", () => {
    expect(redact({ access_token: "abc.def.ghi" })).toEqual({ access_token: "[redacted]" });
  });

  it("masks refresh tokens, passwords, service-role keys, anon keys, api keys", () => {
    expect(
      redact({
        refresh_token: "x",
        password: "y",
        service_role_key: "z",
        anon_key: "a",
        api_key: "b",
      }),
    ).toEqual({
      refresh_token: "[redacted]",
      password: "[redacted]",
      service_role_key: "[redacted]",
      anon_key: "[redacted]",
      api_key: "[redacted]",
    });
  });

  it("masks long digit sequences (>=8 digits) regardless of key", () => {
    expect(redact({ acct: "1234567890123456" })).toEqual({ acct: "[redacted]" });
    expect(redact({ other: "12345678" })).toEqual({ other: "[redacted]" });
  });

  it("preserves short digit sequences (<8 digits)", () => {
    expect(redact({ pin: "1234567" })).toEqual({ pin: "1234567" });
  });

  it("masks amounts at/above the threshold", () => {
    expect(redact({ amount: 250_00 }, { amountThresholdCents: 100_00 })).toEqual({
      amount: "[redacted]",
    });
    expect(redact({ amount: 100_00 }, { amountThresholdCents: 100_00 })).toEqual({
      amount: "[redacted]",
    });
  });

  it("preserves amounts below the threshold", () => {
    expect(redact({ amount: 99_99 }, { amountThresholdCents: 100_00 })).toEqual({
      amount: 99_99,
    });
  });

  it("preserves amount when no threshold given", () => {
    expect(redact({ amount: 1_000_000_00 })).toEqual({ amount: 1_000_000_00 });
  });

  it("walks nested objects", () => {
    expect(redact({ user: { access_token: "x", email: "a@b.c" } })).toEqual({
      user: { access_token: "[redacted]", email: "a@b.c" },
    });
  });

  it("walks arrays of objects", () => {
    expect(redact([{ access_token: "x" }, { other: "ok" }])).toEqual([
      { access_token: "[redacted]" },
      { other: "ok" },
    ]);
  });

  it("passes through primitives unchanged", () => {
    expect(redact(null)).toBe(null);
    expect(redact(42)).toBe(42);
    expect(redact("plain string")).toBe("plain string");
    expect(redact(true)).toBe(true);
  });

  it("does not mutate the input object", () => {
    const input = { access_token: "x", nested: { password: "y" } };
    const copy = JSON.parse(JSON.stringify(input));
    redact(input);
    expect(input).toEqual(copy);
  });

  it("masks camelCase, PascalCase, SCREAMING_SNAKE_CASE, and kebab-case secret keys", () => {
    expect(redact({ accessToken: "x" })).toEqual({ accessToken: "[redacted]" });
    expect(redact({ AccessToken: "x" })).toEqual({ AccessToken: "[redacted]" });
    expect(redact({ ACCESS_TOKEN: "x" })).toEqual({ ACCESS_TOKEN: "[redacted]" });
    expect(redact({ "access-token": "x" })).toEqual({ "access-token": "[redacted]" });
    expect(redact({ apiKey: "x", API_KEY: "y" })).toEqual({
      apiKey: "[redacted]",
      API_KEY: "[redacted]",
    });
  });

  it("returns '[circular]' for circular object references instead of overflowing", () => {
    type Cyclic = { self?: Cyclic; ok: string };
    const a: Cyclic = { ok: "v" };
    a.self = a;
    expect(redact(a)).toEqual({ ok: "v", self: "[circular]" });
  });

  it("returns '[circular]' for circular array references", () => {
    const a: unknown[] = [1];
    a.push(a);
    expect(redact(a)).toEqual([1, "[circular]"]);
  });

  it("threshold redaction respects normalized 'amount' key (camelCase ignored — only literal amount)", () => {
    // Spec: only the 'amount' key triggers threshold redaction. Verify normalization
    // does NOT silently expand to amountCents/Amount/AMOUNT.
    expect(redact({ Amount: 9_999_99 }, { amountThresholdCents: 100_00 })).toEqual({
      Amount: "[redacted]",
    });
    // amountCents is NOT in scope and should pass through unredacted.
    expect(redact({ amountCents: 9_999_99 }, { amountThresholdCents: 100_00 })).toEqual({
      amountCents: 9_999_99,
    });
  });
});
