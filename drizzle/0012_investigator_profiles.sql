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
ALTER TABLE "investigator_profiles" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ACTIVE';
