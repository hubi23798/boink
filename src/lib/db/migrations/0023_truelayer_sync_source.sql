-- TRU-BEU-06: import batch source for aggregator sync runs

ALTER TYPE "public"."import_batch_source_kind" ADD VALUE IF NOT EXISTS 'truelayer_sync';
