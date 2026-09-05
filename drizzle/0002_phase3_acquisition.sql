CREATE TYPE "public"."acquisition_source_type" AS ENUM('TEST_FILE', 'DEVICE', 'IMAGE_FILE');--> statement-breakpoint
CREATE TYPE "public"."acquisition_status" AS ENUM('PENDING', 'AUTHORIZED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."audit_event_type" AS ENUM('REQUESTED', 'AUTHORIZED', 'STARTED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('AVAILABLE', 'REJECTED');--> statement-breakpoint
CREATE TABLE "acquisition_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"device_id" uuid,
	"requested_by" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"status" "acquisition_status" DEFAULT 'PENDING' NOT NULL,
	"source_type" "acquisition_source_type" NOT NULL,
	"source_identifier" text NOT NULL,
	"output_storage_object_id" uuid,
	"sha256" text,
	"size" bigint,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"device_id" uuid,
	"acquisition_job_id" uuid NOT NULL,
	"master_storage_object_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"size" bigint NOT NULL,
	"status" "evidence_status" DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid,
	"device_id" uuid,
	"acquisition_job_id" uuid,
	"authorization_id" uuid,
	"actor_id" uuid,
	"event_type" "audit_event_type" NOT NULL,
	"result" text DEFAULT 'SUCCESS' NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_output_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("output_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_acquisition_job_id_acquisition_jobs_id_fk" FOREIGN KEY ("acquisition_job_id") REFERENCES "public"."acquisition_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_master_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("master_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_acquisition_job_id_acquisition_jobs_id_fk" FOREIGN KEY ("acquisition_job_id") REFERENCES "public"."acquisition_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
