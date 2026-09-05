-- Add sanitization_job_id column to ledger_events for Layer #3
ALTER TABLE ledger_events
  ADD COLUMN IF NOT EXISTS sanitization_job_id uuid;

-- Add foreign key constraint if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'ledger_events'
      AND c.conname = 'ledger_events_sanitization_fk'
  ) THEN
    ALTER TABLE ledger_events
      ADD CONSTRAINT ledger_events_sanitization_fk
      FOREIGN KEY (sanitization_job_id)
      REFERENCES sanitization_jobs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add unique index for sanitization_job_id to ensure idempotency
CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_sanitization_unique ON ledger_events(sanitization_job_id);
