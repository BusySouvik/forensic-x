ALTER TABLE "sanitization_jobs"
  ADD COLUMN IF NOT EXISTS "verification_details" jsonb NOT NULL DEFAULT '{}'::jsonb;
