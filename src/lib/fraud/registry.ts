import type { Detector } from "./interface";

/**
 * Detectors register here as they ship. The runner fans out over this list on
 * ingest (post-categorization) and on the nightly re-scan cron.
 *
 * Empty until the first detector lands:
 *   - vendor-bec           → TRU-C-03
 *   - subscription-trap    → TRU-C-04
 *   - crypto-outflow-scam  → TRU-C-05
 *
 * With an empty registry the runner is a guaranteed no-op — it never touches the
 * DB, so wiring it into ingest now carries zero risk to the CSV path.
 */
export const registeredDetectors: Detector[] = [];
