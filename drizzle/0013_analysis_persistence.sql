CREATE TYPE "public"."acquisition_source_type" AS ENUM('TEST_FILE', 'DEVICE', 'IMAGE_FILE');--> statement-breakpoint
CREATE TYPE "public"."acquisition_status" AS ENUM('QUEUED', 'VALIDATING', 'ACQUIRING', 'VERIFYING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_status" AS ENUM('QUEUED', 'WAITING_FOR_WORKER', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."audit_event_type" AS ENUM('REQUESTED', 'AUTHORIZED', 'STARTED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('PENDING', 'COLLECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('AVAILABLE', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."ledger_event_status" AS ENUM('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."recovery_engine" AS ENUM('TSK', 'FOREMOST', 'BULK_EXTRACTOR', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."recovery_job_status" AS ENUM('QUEUED', 'VALIDATING', 'RECOVERING', 'COLLECTING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."recovery_method" AS ENUM('FILESYSTEM', 'CARVING', 'STRING_SEARCH', 'TIMELINE');--> statement-breakpoint
CREATE TYPE "public"."sanitization_job_status" AS ENUM('QUEUED', 'AUTHORIZED', 'SANITIZING', 'VERIFYING', 'CERTIFICATE_READY', 'COMPLETED', 'CANCELLED', 'SANITIZATION_FAILED', 'VERIFICATION_FAILED', 'UNSUPPORTED_METHOD', 'TARGET_MISMATCH', 'CERTIFICATE_FAILED');--> statement-breakpoint
CREATE TYPE "public"."sanitization_method" AS ENUM('HDD_OVERWRITE', 'SSD_SECURE_ERASE', 'TEST_TRUNCATE');--> statement-breakpoint
CREATE TABLE "acquisition_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"device_id" uuid,
	"requested_by" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"status" "acquisition_status" DEFAULT 'QUEUED' NOT NULL,
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
CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"validation_certificate_id" uuid NOT NULL,
	"working_copy_id" uuid NOT NULL,
	"status" "analysis_job_status" DEFAULT 'QUEUED' NOT NULL,
	"input_sha256" text,
	"result_storage_object_id" uuid,
	"output_sha256" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"investigation_id" uuid NOT NULL,
	"storage_object_id" uuid,
	"output_sha256" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
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
CREATE TABLE "investigation_workflows" (
	"investigation_id" uuid PRIMARY KEY NOT NULL,
	"acquisition_investigator_id" uuid NOT NULL,
	"recovery_investigator_id" uuid NOT NULL,
	"validation_investigator_id" uuid NOT NULL,
	"analysis_investigator_id" uuid NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investigator_id" text NOT NULL,
	"contact_number" text,
	"designation" text NOT NULL,
	"department" text NOT NULL,
	"specialization" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"joining_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"acquisition_job_id" uuid NOT NULL,
	"sanitization_job_id" uuid,
	"event_type" text NOT NULL,
	"event_hash" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"network" text,
	"channel" text,
	"chaincode" text,
	"blockchain_tx_id" text,
	"status" "ledger_event_status" DEFAULT 'PENDING' NOT NULL,
	"anchored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovered_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"recovery_job_id" uuid NOT NULL,
	"working_copy_id" uuid NOT NULL,
	"master_evidence_id" uuid NOT NULL,
	"method" "recovery_method" NOT NULL,
	"engine" "recovery_engine" NOT NULL,
	"source_path" text,
	"source_offset" bigint,
	"source_metadata" text,
	"recovered_path" text,
	"size" bigint,
	"storage_object_id" uuid,
	"provisional_sha256" text,
	"status" "candidate_status" DEFAULT 'PENDING' NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"recovered_candidate_id" uuid NOT NULL,
	"recovery_job_id" uuid NOT NULL,
	"working_copy_id" uuid NOT NULL,
	"master_evidence_id" uuid NOT NULL,
	"artifact_storage_object_id" uuid NOT NULL,
	"artifact_size" bigint,
	"artifact_sha256" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text,
	"created_by" uuid NOT NULL,
	"recovery_signature" text,
	"recovery_signer_id" uuid,
	"validation_signature" text,
	"validation_signer_id" uuid,
	"status" "recovery_certificate_status" DEFAULT 'GENERATED' NOT NULL,
	"validation_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"working_copy_id" uuid NOT NULL,
	"master_evidence_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"status" "recovery_job_status" DEFAULT 'QUEUED' NOT NULL,
	"method" "recovery_method" NOT NULL,
	"engine" "recovery_engine" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_location" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanitization_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"sanitization_job_id" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_reference" text NOT NULL,
	"target_stable_identifier" text,
	"storage_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sanitization_method" "sanitization_method" NOT NULL,
	"bytes_affected" bigint,
	"verification_result" text,
	"verification_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performer_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" text,
	"signature" text,
	"signer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanitization_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_reference" text NOT NULL,
	"target_stable_identifier" text,
	"storage_type" text,
	"sanitization_method" "sanitization_method" NOT NULL,
	"status" "sanitization_job_status" DEFAULT 'QUEUED' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"bytes_affected" bigint,
	"verification_status" text,
	"verification_hash" text,
	"verification_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"certificate_id" uuid,
	"performer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"master_evidence_id" uuid NOT NULL,
	"master_storage_object_id" uuid NOT NULL,
	"source_master_sha256" text NOT NULL,
	"working_copy_sha256" text DEFAULT '' NOT NULL,
	"investigator_id" uuid NOT NULL,
	"authorization_id" uuid NOT NULL,
	"storage_object_id" uuid NOT NULL,
	"status" "working_copy_status" DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_reason" text
);
--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_jobs" ADD CONSTRAINT "acquisition_jobs_output_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("output_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_validation_certificate_id_recovery_certificates_id_fk" FOREIGN KEY ("validation_certificate_id") REFERENCES "public"."recovery_certificates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_working_copy_id_working_copies_id_fk" FOREIGN KEY ("working_copy_id") REFERENCES "public"."working_copies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_result_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("result_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_analysis_job_id_analysis_jobs_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."analysis_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_acquisition_job_id_acquisition_jobs_id_fk" FOREIGN KEY ("acquisition_job_id") REFERENCES "public"."acquisition_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_acquisition_job_id_acquisition_jobs_id_fk" FOREIGN KEY ("acquisition_job_id") REFERENCES "public"."acquisition_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_master_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("master_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_workflows" ADD CONSTRAINT "investigation_workflows_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_workflows" ADD CONSTRAINT "investigation_workflows_acquisition_investigator_id_users_id_fk" FOREIGN KEY ("acquisition_investigator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_workflows" ADD CONSTRAINT "investigation_workflows_recovery_investigator_id_users_id_fk" FOREIGN KEY ("recovery_investigator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_workflows" ADD CONSTRAINT "investigation_workflows_validation_investigator_id_users_id_fk" FOREIGN KEY ("validation_investigator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_workflows" ADD CONSTRAINT "investigation_workflows_analysis_investigator_id_users_id_fk" FOREIGN KEY ("analysis_investigator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigator_profiles" ADD CONSTRAINT "investigator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_evidence_id_evidence_records_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_acquisition_job_id_acquisition_jobs_id_fk" FOREIGN KEY ("acquisition_job_id") REFERENCES "public"."acquisition_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_sanitization_job_id_sanitization_jobs_id_fk" FOREIGN KEY ("sanitization_job_id") REFERENCES "public"."sanitization_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovered_candidates" ADD CONSTRAINT "recovered_candidates_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovered_candidates" ADD CONSTRAINT "recovered_candidates_recovery_job_id_recovery_jobs_id_fk" FOREIGN KEY ("recovery_job_id") REFERENCES "public"."recovery_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovered_candidates" ADD CONSTRAINT "recovered_candidates_working_copy_id_working_copies_id_fk" FOREIGN KEY ("working_copy_id") REFERENCES "public"."working_copies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovered_candidates" ADD CONSTRAINT "recovered_candidates_master_evidence_id_evidence_records_id_fk" FOREIGN KEY ("master_evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovered_candidates" ADD CONSTRAINT "recovered_candidates_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_recovered_candidate_id_recovered_candidates_id_fk" FOREIGN KEY ("recovered_candidate_id") REFERENCES "public"."recovered_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_recovery_job_id_recovery_jobs_id_fk" FOREIGN KEY ("recovery_job_id") REFERENCES "public"."recovery_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_working_copy_id_working_copies_id_fk" FOREIGN KEY ("working_copy_id") REFERENCES "public"."working_copies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_master_evidence_id_evidence_records_id_fk" FOREIGN KEY ("master_evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_artifact_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("artifact_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_recovery_signer_id_users_id_fk" FOREIGN KEY ("recovery_signer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_certificates" ADD CONSTRAINT "recovery_certificates_validation_signer_id_users_id_fk" FOREIGN KEY ("validation_signer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_working_copy_id_working_copies_id_fk" FOREIGN KEY ("working_copy_id") REFERENCES "public"."working_copies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_master_evidence_id_evidence_records_id_fk" FOREIGN KEY ("master_evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_certificates" ADD CONSTRAINT "sanitization_certificates_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_certificates" ADD CONSTRAINT "sanitization_certificates_sanitization_job_id_sanitization_jobs_id_fk" FOREIGN KEY ("sanitization_job_id") REFERENCES "public"."sanitization_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_certificates" ADD CONSTRAINT "sanitization_certificates_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_certificates" ADD CONSTRAINT "sanitization_certificates_performer_id_users_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_certificates" ADD CONSTRAINT "sanitization_certificates_signer_id_users_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_jobs" ADD CONSTRAINT "sanitization_jobs_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_jobs" ADD CONSTRAINT "sanitization_jobs_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_jobs" ADD CONSTRAINT "sanitization_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanitization_jobs" ADD CONSTRAINT "sanitization_jobs_performer_id_users_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_master_evidence_id_evidence_records_id_fk" FOREIGN KEY ("master_evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_master_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("master_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_investigator_id_users_id_fk" FOREIGN KEY ("investigator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_authorization_id_operation_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."operation_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investigator_profiles_user_unique" ON "investigator_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investigator_profiles_investigator_id_unique" ON "investigator_profiles" USING btree ("investigator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_events_acq_unique" ON "ledger_events" USING btree ("acquisition_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_events_sanitization_unique" ON "ledger_events" USING btree ("sanitization_job_id");