DO $$ BEGIN
  CREATE TYPE "sanitization_method" AS ENUM ('HDD_OVERWRITE', 'SSD_SECURE_ERASE', 'TEST_TRUNCATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "sanitization_job_status" AS ENUM ('QUEUED', 'AUTHORIZED', 'SANITIZING', 'VERIFYING', 'CERTIFICATE_READY', 'COMPLETED', 'CANCELLED', 'SANITIZATION_FAILED', 'VERIFICATION_FAILED', 'UNSUPPORTED_METHOD', 'TARGET_MISMATCH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "sanitization_job_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TABLE IF NOT EXISTS "sanitization_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investigation_id" uuid NOT NULL REFERENCES "investigations"("id") ON DELETE cascade,
  "authorization_id" uuid NOT NULL REFERENCES "operation_authorizations"("id") ON DELETE restrict,
  "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "target_type" text NOT NULL, "target_reference" text NOT NULL, "target_stable_identifier" text, "storage_type" text,
  "sanitization_method" "sanitization_method" NOT NULL, "status" "sanitization_job_status" NOT NULL DEFAULT 'QUEUED',
  "started_at" timestamp with time zone, "completed_at" timestamp with time zone, "bytes_affected" bigint,
  "verification_status" text, "verification_hash" text, "failure_reason" text,
  "performer_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(), "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sanitization_certificates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investigation_id" uuid NOT NULL REFERENCES "investigations"("id") ON DELETE cascade,
  "sanitization_job_id" uuid NOT NULL REFERENCES "sanitization_jobs"("id") ON DELETE cascade,
  "authorization_id" uuid NOT NULL REFERENCES "operation_authorizations"("id") ON DELETE restrict,
  "target_type" text NOT NULL, "target_reference" text NOT NULL, "target_stable_identifier" text,
  "storage_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "sanitization_method" "sanitization_method" NOT NULL,
  "bytes_affected" bigint, "verification_result" text, "verification_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "performer_id" uuid REFERENCES "users"("id") ON DELETE set null, "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "payload_hash" text, "signature" text, "signer_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
