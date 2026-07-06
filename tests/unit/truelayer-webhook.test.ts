import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SignatureError } from "truelayer-signing";
import {
  __resetJwksCacheForTests,
  assertSignatureNotReplayed,
  extractCredentialsId,
  isAllowedJku,
  parseJwsHeaderIat,
  shouldTriggerSync,
  verifyTrueLayerWebhook,
} from "@/lib/aggregators/truelayer/webhook";

const mockExtractJku = vi.fn();
const mockVerify = vi.fn();

vi.mock("truelayer-signing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("truelayer-signing")>();
  return {
    ...actual,
    extractJku: (...args: unknown[]) => mockExtractJku(...args),
    verify: (...args: unknown[]) => mockVerify(...args),
  };
});

vi.mock("@/lib/aggregators/truelayer/config", () => ({
  getTrueLayerWebhookJwksUri: () => "https://webhooks.truelayer-sandbox.com/.well-known/jwks",
}));

describe("TrueLayer webhook helpers", () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
    mockExtractJku.mockReturnValue("https://webhooks.truelayer-sandbox.com/.well-known/jwks");
    mockVerify.mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ keys: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("allows known TrueLayer JKUs", () => {
    expect(isAllowedJku("https://webhooks.truelayer-sandbox.com/.well-known/jwks")).toBe(true);
    expect(isAllowedJku("https://evil.example/jwks")).toBe(false);
  });

  it("parses iat from detached JWS header", () => {
    const header = Buffer.from(JSON.stringify({ iat: 1_700_000_000, alg: "RS512" })).toString(
      "base64url",
    );
    const sig = `${header}..fakesig`;
    expect(parseJwsHeaderIat(sig)).toBe(1_700_000_000);
  });

  it("rejects replayed signatures older than 5 minutes", () => {
    const iat = Math.floor(Date.now() / 1000) - 600;
    const header = Buffer.from(JSON.stringify({ iat })).toString("base64url");
    expect(() => assertSignatureNotReplayed(`${header}..sig`)).toThrow(SignatureError);
  });

  it("accepts fresh signatures", () => {
    const iat = Math.floor(Date.now() / 1000) - 30;
    const header = Buffer.from(JSON.stringify({ iat })).toString("base64url");
    expect(() => assertSignatureNotReplayed(`${header}..sig`)).not.toThrow();
  });

  it("verifyTrueLayerWebhook calls library verify with JWKS", async () => {
    const iat = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ iat })).toString("base64url");
    const signature = `${header}..sig`;
    await verifyTrueLayerWebhook({
      body: '{"credentials_id":"cred-1","status":"Succeeded"}',
      tlSignature: signature,
      method: "POST",
      path: "/api/aggregators/truelayer/webhook",
      headers: { "content-type": "application/json" },
    });
    expect(mockVerify).toHaveBeenCalled();
  });

  it("rejects tampered body when verify throws", async () => {
    mockVerify.mockImplementation(() => {
      throw new SignatureError("invalid signature");
    });
    const iat = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ iat })).toString("base64url");
    await expect(
      verifyTrueLayerWebhook({
        body: "tampered",
        tlSignature: `${header}..sig`,
        method: "POST",
        path: "/api/aggregators/truelayer/webhook",
        headers: {},
      }),
    ).rejects.toThrow(SignatureError);
  });

  it("extractCredentialsId from Data API payload", () => {
    expect(extractCredentialsId({ credentials_id: "cred-abc", status: "Succeeded" })).toBe(
      "cred-abc",
    );
    expect(
      extractCredentialsId({
        event_type: "transaction.created",
        event_body: { credentials_id: "cred-event" },
      }),
    ).toBe("cred-event");
  });

  it("shouldTriggerSync for async Data API success", () => {
    expect(shouldTriggerSync({ credentials_id: "x", status: "Succeeded" })).toBe(true);
    expect(shouldTriggerSync({ credentials_id: "x", status: "Failed" })).toBe(false);
    expect(shouldTriggerSync({ event_type: "transaction.created" })).toBe(true);
  });
});
