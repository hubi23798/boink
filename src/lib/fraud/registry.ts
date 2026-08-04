import type { Detector } from "./interface";
import { subscriptionTrapDetector } from "./subscription-trap/detector";
import { vendorBecDetector } from "./vendor-bec/detector";

/**
 * Detectors register here as they ship. The runner fans out over this list on
 * ingest (post-categorization), TrueLayer sync, and the nightly re-scan cron.
 */
export const registeredDetectors: Detector[] = [
  vendorBecDetector,
  subscriptionTrapDetector,
];
