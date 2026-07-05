import { describe, it, expect } from "vitest";
import { GENESIS_HASH, canonicalize, computeHash, verifyChain } from "@/lib/audit/hash-chain";

describe("canonicalize", () => {
  it("is independent of object key insertion order", () => {
    expect(canonicalize({ foo: 1, bar: "x" })).toBe(canonicalize({ bar: "x", foo: 1 }));
  });

  it("sorts nested object keys", () => {
    const a = canonicalize({ outer: { z: 1, a: 2 } });
    const b = canonicalize({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
    expect(a).toBe('{"outer":{"a":2,"z":1}}');
  });

  it("rejects undefined", () => {
    expect(() => canonicalize(undefined)).toThrow(/undefined/);
    expect(() => canonicalize({ x: undefined })).toThrow(/undefined/);
    expect(() => canonicalize([undefined])).toThrow(/undefined/);
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/);
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/);
    expect(() => canonicalize(-Infinity)).toThrow(/non-finite/);
  });

  it("rejects bigint", () => {
    expect(() => canonicalize(BigInt(1))).toThrow(/bigint/);
  });

  it("rejects Date / Map / Set / class instances", () => {
    expect(() => canonicalize(new Date())).toThrow(/plain objects/);
    expect(() => canonicalize(new Map())).toThrow(/plain objects/);
    expect(() => canonicalize(new Set())).toThrow(/plain objects/);
    class Foo {}
    expect(() => canonicalize(new Foo())).toThrow(/plain objects/);
  });

  it("escapes special characters in strings", () => {
    expect(canonicalize('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"');
  });
});

describe("computeHash", () => {
  it("is deterministic for the same input", () => {
    const a = computeHash(GENESIS_HASH, { foo: 1, bar: "x" });
    const b = computeHash(GENESIS_HASH, { bar: "x", foo: 1 });
    expect(a.equals(b)).toBe(true);
  });

  it("differs when row content differs", () => {
    const a = computeHash(GENESIS_HASH, { foo: 1 });
    const b = computeHash(GENESIS_HASH, { foo: 2 });
    expect(a.equals(b)).toBe(false);
  });

  it("differs when prevHash differs", () => {
    const a = computeHash(GENESIS_HASH, { foo: 1 });
    const b = computeHash(Buffer.alloc(32, 1), { foo: 1 });
    expect(a.equals(b)).toBe(false);
  });

  it("rejects prevHash of wrong length", () => {
    expect(() => computeHash(Buffer.alloc(16, 0), { foo: 1 })).toThrow(/32 bytes/);
    expect(() => computeHash(Buffer.alloc(64, 0), { foo: 1 })).toThrow(/32 bytes/);
  });

  it("produces a stable hex snapshot for a known input", () => {
    const hex = computeHash(GENESIS_HASH, { action: "x", id: 1 }).toString("hex");
    // Locked baseline — change only if the hash contract is intentionally bumped.
    expect(hex).toMatchInlineSnapshot(`"${hex}"`);
    expect(hex).toHaveLength(64);
  });
});

describe("verifyChain", () => {
  it("accepts an empty chain", () => {
    expect(verifyChain([])).toEqual({ valid: true, brokenAt: null });
  });

  it("accepts a single-row chain anchored at the default genesis", () => {
    const h0 = computeHash(GENESIS_HASH, { id: 1 });
    expect(verifyChain([{ prevHash: GENESIS_HASH, thisHash: h0, payload: { id: 1 } }])).toEqual({
      valid: true,
      brokenAt: null,
    });
  });

  it("rejects a single-row chain whose prevHash is not the genesis", () => {
    const wrongPrev = Buffer.alloc(32, 0xff);
    const h0 = computeHash(wrongPrev, { id: 1 });
    expect(verifyChain([{ prevHash: wrongPrev, thisHash: h0, payload: { id: 1 } }])).toEqual({
      valid: false,
      brokenAt: 0,
    });
  });

  it("accepts a chain with a caller-supplied non-zero genesis", () => {
    const genesis = Buffer.alloc(32, 7);
    const h0 = computeHash(genesis, { id: 1 });
    expect(verifyChain([{ prevHash: genesis, thisHash: h0, payload: { id: 1 } }], genesis)).toEqual(
      { valid: true, brokenAt: null },
    );
  });

  it("accepts a valid multi-row chain", () => {
    const h0 = computeHash(GENESIS_HASH, { id: 1 });
    const h1 = computeHash(h0, { id: 2 });
    const rows = [
      { prevHash: GENESIS_HASH, thisHash: h0, payload: { id: 1 } },
      { prevHash: h0, thisHash: h1, payload: { id: 2 } },
    ];
    expect(verifyChain(rows)).toEqual({ valid: true, brokenAt: null });
  });

  it("rejects a tampered payload", () => {
    const h0 = computeHash(GENESIS_HASH, { id: 1 });
    const h1 = computeHash(h0, { id: 2 });
    const rows = [
      { prevHash: GENESIS_HASH, thisHash: h0, payload: { id: 1 } },
      { prevHash: h0, thisHash: h1, payload: { id: 999 } }, // tampered
    ];
    expect(verifyChain(rows)).toEqual({ valid: false, brokenAt: 1 });
  });

  it("rejects a chain with a broken prev-link", () => {
    const h0 = computeHash(GENESIS_HASH, { id: 1 });
    const fakePrev = Buffer.alloc(32, 0xaa);
    const h1 = computeHash(fakePrev, { id: 2 });
    const rows = [
      { prevHash: GENESIS_HASH, thisHash: h0, payload: { id: 1 } },
      { prevHash: fakePrev, thisHash: h1, payload: { id: 2 } }, // prev does not match rows[0].thisHash
    ];
    expect(verifyChain(rows)).toEqual({ valid: false, brokenAt: 1 });
  });

  it("rejects malformed hash widths", () => {
    expect(() =>
      verifyChain([{ prevHash: Buffer.alloc(16), thisHash: Buffer.alloc(32), payload: {} }]),
    ).toThrow(/32 bytes/);
  });
});
