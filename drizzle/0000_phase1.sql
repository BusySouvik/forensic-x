CREATE TYPE "public"."authorization_status" AS ENUM('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('SATA', 'USB', 'NVME', 'NETWORK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('REGISTERED', 'IN_CUSTODY', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('HDD', 'SSD', 'NVME', 'USB', 'MOBILE', 'OPTICAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."investigation_status" AS ENUM('OPEN', 'IN_PROGRESS', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."operation_type" AS ENUM('ACQUISITION', 'RECOVERY', 'EXAMINATION', 'SANITIZATION', 'EXPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'INVESTIGATOR');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"device_identifier" text NOT NULL,
	"device_type" "device_type" NOT NULL,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"capacity" text,
	"connection_type" "connection_type",
	"status" "device_status" DEFAULT 'REGISTERED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "investigation_status" DEFAULT 'OPEN' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"device_id" uuid,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"operation_type" "operation_type" NOT NULL,
	"reason" text NOT NULL,
	"status" "authorization_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_authorizations" ADD CONSTRAINT "operation_authorizations_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_authorizations" ADD CONSTRAINT "operation_authorizations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_authorizations" ADD CONSTRAINT "operation_authorizations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_authorizations" ADD CONSTRAINT "operation_authorizations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_investigation_identifier_unique" ON "devices" USING btree ("investigation_id","device_identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "investigations_number_unique" ON "investigations" USING btree ("investigation_number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");