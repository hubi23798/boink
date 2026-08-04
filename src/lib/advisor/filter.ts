/**
 * Back-compat re-export. New code should import from `@/lib/policy/output-filter`.
 */
export {
  DISCLAIMER,
  applyOutputFilter,
  detectEchoBack,
  extractUserDataSnippets,
  type FilterResult,
  type OutputFilterOptions,
} from "@/lib/policy/output-filter";
