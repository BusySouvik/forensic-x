DO $$
BEGIN
  CREATE TYPE "public"."analysis_job_status" AS ENUM('QUEUED', 'WAITING_FOR_WORKER', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "investigator_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "investigator_id" text NOT NULL,
  "contact_number" text,
  "designation" text NOT NULL,
  "department" text NOT NULL,
  "specialization" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "joining_date" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "investigator_profiles_user_unique" UNIQUE ("user_id"),
  CONSTRAINT "investigator_profiles_investigator_id_unique" UNIQUE ("investigator_id")
);
--> statement-breakpoint

ALTER TABLE "investigator_profiles"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ACTIVE';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "analysis_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investigation_id" uuid NOT NULL REFERENCES "investigations"("id") ON DELETE cascade,
  "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "validation_certificate_id" uuid NOT NULL REFERENCES "recovery_certificates"("id") ON DELETE restrict,
  "working_copy_id" uuid NOT NULL REFERENCES "working_copies"("id") ON DELETE restrict,
  "status" "analysis_job_status" DEFAULT 'QUEUED' NOT NULL,
  "input_sha256" text,
  "result_storage_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE set null,
  "output_sha256" text,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "analysis_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "analysis_job_id" uuid NOT NULL REFERENCES "analysis_jobs"("id") ON DELETE cascade,
  "investigation_id" uuid NOT NULL REFERENCES "investigations"("id") ON DELETE cascade,
  "storage_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE set null,
  "output_sha256" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
