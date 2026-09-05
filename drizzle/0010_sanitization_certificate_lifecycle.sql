ALTER TYPE "sanitization_job_status" ADD VALUE IF NOT EXISTS 'CERTIFICATE_FAILED';

ALTER TABLE "sanitization_jobs"
  ADD COLUMN IF NOT EXISTS "certificate_id" uuid REFERENCES "sanitization_certificates"("id") ON DELETE SET NULL;
