import type { AggregatorProvider, AggregatorSource } from "@/lib/aggregators/interface";
import { createTrueLayerSource } from "@/lib/aggregators/truelayer/client";

export function getAggregatorSource(provider: AggregatorProvider): AggregatorSource {
  switch (provider) {
    case "truelayer":
      return createTrueLayerSource();
    default:
      throw new Error(`unsupported aggregator provider: ${provider}`);
  }
}
