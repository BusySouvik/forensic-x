-- Migration: add ledger_events table for blockchain anchoring

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_event_status') THEN
    CREATE TYPE ledger_event_status AS ENUM ('PENDING','SUBMITTED','CONFIRMED','FAILED','UNAVAILABLE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ledger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE,
  acquisition_job_id uuid NOT NULL REFERENCES acquisition_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  network text,
  channel text,
  chaincode text,
  blockchain_tx_id text,
  status ledger_event_status NOT NULL DEFAULT 'PENDING',
  anchored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_events_acq_idx ON ledger_events(acquisition_job_id);
