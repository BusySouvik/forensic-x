CREATE TYPE "public"."deletion_policy" AS ENUM('DELETABLE', 'MASTER_IMAGE_PROTECTED');--> statement-breakpoint
CREATE TYPE "public"."storage_class" AS ENUM('FORENSIC_IMAGE', 'WORKING_COPY', 'RECOVERED_EVIDENCE', 'CERTIFICATE');--> statement-breakpoint
CREATE TYPE "public"."storage_status" AS ENUM('UPLOADING', 'AVAILABLE', 'MISSING', 'DELETED');--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid,
	"evidence_id" text,
	"storage_class" "storage_class" NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "storage_status" DEFAULT 'AVAILABLE' NOT NULL,
	"deletion_policy" "deletion_policy" DEFAULT 'DELETABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_bucket_key_unique" ON "storage_objects" USING btree ("bucket","object_key");