-- Minimal Supabase-compatible stubs for plain Postgres (GitHub Actions CI).
-- Production uses real Supabase Auth; these only exist so RLS policies and
-- REVOKE statements in migrations can apply cleanly in CI.

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

-- Stub vault schema so 0022_aggregator_vault.sql can apply without the
-- real supabase_vault extension (unavailable on plain Postgres).
CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  secret text,
  description text
);

CREATE OR REPLACE VIEW vault.decrypted_secrets AS
SELECT id, name, secret AS decrypted_secret, description
FROM vault.secrets;

CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret text,
  new_name text DEFAULT NULL,
  new_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  secret_id uuid;
BEGIN
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (new_name, new_secret, new_description)
  ON CONFLICT (name) DO UPDATE
    SET secret = EXCLUDED.secret,
        description = COALESCE(EXCLUDED.description, vault.secrets.description)
  RETURNING id INTO secret_id;
  RETURN secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION vault.update_secret(
  secret_id uuid,
  new_secret text DEFAULT NULL,
  new_name text DEFAULT NULL,
  new_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE vault.secrets
  SET
    secret = COALESCE(new_secret, secret),
    name = COALESCE(new_name, name),
    description = COALESCE(new_description, description)
  WHERE id = secret_id;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
