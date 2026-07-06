import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createOAuthNonce,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/aggregators/oauth-state";
import { buildAuthUrl, exchangeAuthorizationCode } from "@/lib/aggregators/truelayer/oauth";
import type { TrueLayerConfig } from "@/lib/aggregators/truelayer/config";

const TEST_CONFIG: TrueLayerConfig = {
  env: "sandbox",
  authBase: "https://auth.truelayer-sandbox.com",
  apiBase: "https://api.truelayer-sandbox.com",
  clientId: "sandbox-client",
  clientSecret: "sandbox-secret",
  redirectUri: "http://localhost:3000/api/aggregators/truelayer/callback",
};

const SECRET = "test-oauth-state-secret-min-16";

describe("TrueLayer OAuth", () => {
  describe("buildAuthUrl", () => {
    it("includes client, redirect, scope, and state", () => {
      const url = buildAuthUrl({ state: "signed-state", config: TEST_CONFIG });
      expect(url).toContain("https://auth.truelayer-sandbox.com/");
      expect(url).toContain("client_id=sandbox-client");
      expect(url).toContain(
        "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Faggregators%2Ftruelayer%2Fcallback",
      );
      expect(url).toContain("scope=info+accounts+balance+transactions+offline_access");
      expect(url).toContain("state=signed-state");
    });
  });

  describe("oauth state", () => {
    it("round-trips signed state", () => {
      const payload = {
        tenantId: "00000000-0000-0000-0000-0000000000aa",
        userId: "11111111-1111-1111-1111-111111111111",
        nonce: createOAuthNonce(),
        issuedAt: Date.now(),
      };
      const token = signOAuthState(payload, SECRET);
      expect(verifyOAuthState(token, SECRET)).toEqual(payload);
    });

    it("rejects replay with wrong secret", () => {
      const token = signOAuthState(
        {
          tenantId: "t",
          userId: "u",
          nonce: "n",
          issuedAt: Date.now(),
        },
        SECRET,
      );
      expect(verifyOAuthState(token, "wrong-secret-min-16-chars")).toBeNull();
    });

    it("rejects expired state", () => {
      const token = signOAuthState(
        {
          tenantId: "t",
          userId: "u",
          nonce: "n",
          issuedAt: Date.now() - 11 * 60 * 1000,
        },
        SECRET,
      );
      expect(verifyOAuthState(token, SECRET)).toBeNull();
    });
  });

  describe("exchangeAuthorizationCode", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("exchanges code for tokens", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
        }),
      });

      const tokens = await exchangeAuthorizationCode("auth-code", TEST_CONFIG);
      expect(tokens.accessToken).toBe("at");
      expect(tokens.refreshToken).toBe("rt");
      expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    });
  });
});
