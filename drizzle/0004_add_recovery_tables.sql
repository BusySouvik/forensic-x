-- Minimal incremental migration: add enums and tables required by recovery features

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_engine') THEN
    CREATE TYPE recovery_engine AS ENUM ('TSK','FOREMOST','BULK_EXTRACTOR','CUSTOM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_job_status') THEN
    CREATE TYPE recovery_job_status AS ENUM ('QUEUED','VALIDATING','RECOVERING','COLLECTING','COMPLETED','FAILED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_method') THEN
    CREATE TYPE recovery_method AS ENUM ('FILESYSTEM','CARVING','STRING_SEARCH','TIMELINE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_status') THEN
    CREATE TYPE candidate_status AS ENUM ('PENDING','COLLECTED','FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'working_copy_status') THEN
    CREATE TYPE working_copy_status AS ENUM ('QUEUED','CREATING','VERIFYING','COMPLETED','FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS working_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  master_evidence_id uuid NOT NULL REFERENCES evidence_records(id) ON DELETE RESTRICT,
  master_storage_object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
  source_master_sha256 text NOT NULL,
  working_copy_sha256 text NOT NULL DEFAULT '',
  investigator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  authorization_id uuid NOT NULL REFERENCES operation_authorizations(id) ON DELETE RESTRICT,
  storage_object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
  status working_copy_status NOT NULL DEFAULT 'QUEUED',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_reason text
);

CREATE TABLE IF NOT EXISTS recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  working_copy_id uuid NOT NULL REFERENCES working_copies(id) ON DELETE RESTRICT,
  master_evidence_id uuid NOT NULL REFERENCES evidence_records(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  authorization_id uuid NOT NULL REFERENCES operation_authorizations(id) ON DELETE RESTRICT,
  status recovery_job_status NOT NULL DEFAULT 'QUEUED',
  method recovery_method NOT NULL,
  engine recovery_engine NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  output_location text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovered_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  recovery_job_id uuid NOT NULL REFERENCES recovery_jobs(id) ON DELETE CASCADE,
  working_copy_id uuid NOT NULL REFERENCES working_copies(id) ON DELETE RESTRICT,
  master_evidence_id uuid NOT NULL REFERENCES evidence_records(id) ON DELETE RESTRICT,
  method recovery_method NOT NULL,
  engine recovery_engine NOT NULL,
  source_path text,
  source_offset bigint,
  source_metadata text,
  recovered_path text,
  size bigint,
  storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  provisional_sha256 text,
  status candidate_status NOT NULL DEFAULT 'PENDING',
  provenance jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
