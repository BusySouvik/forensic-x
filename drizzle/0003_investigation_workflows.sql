CREATE TABLE "investigation_workflows" (
  "investigation_id" uuid PRIMARY KEY NOT NULL REFERENCES "investigations"("id") ON DELETE cascade,
  "acquisition_investigator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "recovery_investigator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "validation_investigator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "analysis_investigator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "version" bigint NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
