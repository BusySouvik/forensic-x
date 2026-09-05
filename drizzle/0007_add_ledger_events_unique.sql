-- Migration: add unique constraint/index to ledger_events on acquisition_job_id

-- Create a unique index to enforce single ledger event per acquisition job.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_acq_unique ON ledger_events(acquisition_job_id);
