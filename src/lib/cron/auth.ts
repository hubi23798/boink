/** Shared cron route authorization (Fly scheduler, Vercel Cron, manual). */
import { env } from "@/env";

export function isCronAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
