-- Phase B-EU: Supabase Vault wrappers for aggregator tokens (TRU-BEU-02)
-- Service-role only — never expose to authenticated/anon JWT paths.

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.aggregator_vault_store(
  secret_name text,
  secret_value text,
  secret_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF secret_name IS NULL OR length(trim(secret_name)) = 0 THEN
    RAISE EXCEPTION 'secret_name required';
  END IF;
  IF secret_value IS NULL OR length(secret_value) = 0 THEN
    RAISE EXCEPTION 'secret_value required';
  END IF;
  RETURN vault.create_secret(secret_value, secret_name, secret_description);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.aggregator_vault_read(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  value text;
BEGIN
  SELECT decrypted_secret INTO value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN value;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.aggregator_vault_update(
  secret_name text,
  secret_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  secret_id uuid;
BEGIN
  SELECT id INTO secret_id FROM vault.secrets WHERE name = secret_name LIMIT 1;
  IF secret_id IS NULL THEN
    RAISE EXCEPTION 'secret not found: %', secret_name;
  END IF;
  PERFORM vault.update_secret(secret_id, secret_value, secret_name, NULL);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.aggregator_vault_delete(secret_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.aggregator_vault_store(text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.aggregator_vault_read(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.aggregator_vault_update(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.aggregator_vault_delete(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.aggregator_vault_store(text, text, text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.aggregator_vault_read(text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.aggregator_vault_update(text, text) TO service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.aggregator_vault_delete(text) TO service_role;
