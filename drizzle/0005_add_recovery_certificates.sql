-- Migration: add recovery_certificates table

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_certificate_status') THEN
    CREATE TYPE recovery_certificate_status AS ENUM ('GENERATED','READY_FOR_VALIDATION','VALIDATED','VALIDATION_FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS recovery_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  recovered_candidate_id uuid NOT NULL REFERENCES recovered_candidates(id) ON DELETE CASCADE,
  recovery_job_id uuid NOT NULL REFERENCES recovery_jobs(id) ON DELETE CASCADE,
  working_copy_id uuid NOT NULL REFERENCES working_copies(id) ON DELETE RESTRICT,
  master_evidence_id uuid NOT NULL REFERENCES evidence_records(id) ON DELETE RESTRICT,
  artifact_storage_object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
  artifact_size bigint,
  artifact_sha256 text,
  payload jsonb NOT NULL DEFAULT '{}',
  payload_hash text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recovery_signature text,
  recovery_signer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  validation_signature text,
  validation_signer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status recovery_certificate_status NOT NULL DEFAULT 'GENERATED',
  validation_details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
