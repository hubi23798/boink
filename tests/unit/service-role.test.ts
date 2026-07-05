import { describe, it, expect, vi } from "vitest";
import { runAsService } from "@/lib/tenancy/service-role";

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn().mockReturnValue({ db: "mock-service-client" }),
}));

describe("runAsService", () => {
  it("invokes the callback with a service-role client", async () => {
    const cb = vi.fn().mockResolvedValue("ok");
    const result = await runAsService(cb);
    expect(result).toBe("ok");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("throws if requireCronContext and CRON_CONTEXT not set", async () => {
    delete process.env.CRON_CONTEXT;
    await expect(runAsService(async () => "x", { requireCronContext: true })).rejects.toThrow(
      /cron context/,
    );
  });
});
