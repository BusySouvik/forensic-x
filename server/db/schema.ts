import {
  bigint,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "INVESTIGATOR"]);
export const investigationStatusEnum = pgEnum("investigation_status", [
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
  "ARCHIVED",
]);
export const deviceTypeEnum = pgEnum("device_type", [
  "HDD",
  "SSD",
  "NVME",
  "USB",
  "MOBILE",
  "OPTICAL",
  "OTHER",
]);
export const deviceStatusEnum = pgEnum("device_status", ["REGISTERED", "IN_CUSTODY", "RELEASED"]);
export const connectionTypeEnum = pgEnum("connection_type", ["SATA", "USB", "NVME", "NETWORK", "OTHER"]);
export const operationTypeEnum = pgEnum("operation_type", [
  "ACQUISITION",
  "RECOVERY",
  "EXAMINATION",
  "SANITIZATION",
  "EXPORT",
  "OTHER",
]);
export const authorizationStatusEnum = pgEnum("authorization_status", [
  "PENDING",
  "APPROVED",
  "DENIED",
  "EXPIRED",
  "REVOKED",
]);
export const storageClassEnum = pgEnum("storage_class", [
  "FORENSIC_IMAGE",
  "WORKING_COPY",
  "RECOVERED_EVIDENCE",
  "CERTIFICATE",
]);
export const storageStatusEnum = pgEnum("storage_status", ["UPLOADING", "AVAILABLE", "MISSING", "DELETED"]);
export const deletionPolicyEnum = pgEnum("deletion_policy", ["DELETABLE", "MASTER_IMAGE_PROTECTED"]);
export const acquisitionStatusEnum = pgEnum("acquisition_status", [
  "QUEUED",
  "VALIDATING",
  "ACQUIRING",
  "VERIFYING",
  "UPLOADING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const acquisitionSourceTypeEnum = pgEnum("acquisition_source_type", ["TEST_FILE", "DEVICE", "IMAGE_FILE"]);
export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "REQUESTED",
  "AUTHORIZED",
  "STARTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const evidenceStatusEnum = pgEnum("evidence_status", ["AVAILABLE", "REJECTED"]);
export const recoveryMethodEnum = pgEnum("recovery_method", ["FILESYSTEM", "CARVING", "STRING_SEARCH", "TIMELINE"]);
export const recoveryEngineEnum = pgEnum("recovery_engine", ["TSK", "FOREMOST", "BULK_EXTRACTOR", "CUSTOM"]);
export const recoveryJobStatusEnum = pgEnum("recovery_job_status", [
  "QUEUED",
  "VALIDATING",
  "RECOVERING",
  "COLLECTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const candidateStatusEnum = pgEnum("candidate_status", ["PENDING", "COLLECTED", "FAILED"]);
export const sanitizationMethodEnum = pgEnum("sanitization_method", ["HDD_OVERWRITE", "SSD_SECURE_ERASE", "TEST_TRUNCATE"]);
export const sanitizationJobStatusEnum = pgEnum("sanitization_job_status", [
  "QUEUED",
  "AUTHORIZED",
  "SANITIZING",
  "VERIFYING",
  "CERTIFICATE_READY",
  "COMPLETED",
  "CANCELLED",
  "SANITIZATION_FAILED",
  "VERIFICATION_FAILED",
  "UNSUPPORTED_METHOD",
  "TARGET_MISMATCH",
  "CERTIFICATE_FAILED",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

/** Professional identity for an investigator.  Kept separate from the account so
 * forensic references continue to point at the stable users record. */
export const investigatorProfiles = pgTable("investigator_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  investigatorId: text("investigator_id").notNull(),
  contactNumber: text("contact_number"),
  designation: text("designation").notNull(),
  department: text("department").notNull(),
  specialization: text("specialization"),
  status: text("status").notNull().default("ACTIVE"),
  joiningDate: timestamp("joining_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("investigator_profiles_user_unique").on(table.userId),
  uniqueIndex("investigator_profiles_investigator_id_unique").on(table.investigatorId),
]);

export const investigations = pgTable("investigations", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationNumber: text("investigation_number").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: investigationStatusEnum("status").notNull().default("OPEN"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("investigations_number_unique").on(table.investigationNumber)]);

export const investigationWorkflows = pgTable("investigation_workflows", {
  investigationId: uuid("investigation_id").primaryKey().references(() => investigations.id, { onDelete: "cascade" }),
  acquisitionInvestigatorId: uuid("acquisition_investigator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recoveryInvestigatorId: uuid("recovery_investigator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  validationInvestigatorId: uuid("validation_investigator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  analysisInvestigatorId: uuid("analysis_investigator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  deviceIdentifier: text("device_identifier").notNull(),
  deviceType: deviceTypeEnum("device_type").notNull(),
  manufacturer: text("manufacturer"),
  model: text("model"),
  serialNumber: text("serial_number"),
  capacity: text("capacity"),
  connectionType: connectionTypeEnum("connection_type"),
  status: deviceStatusEnum("status").notNull().default("REGISTERED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("devices_investigation_identifier_unique").on(table.investigationId, table.deviceIdentifier)]);

export const operationAuthorizations = pgTable("operation_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  operationType: operationTypeEnum("operation_type").notNull(),
  reason: text("reason").notNull(),
  status: authorizationStatusEnum("status").notNull().default("PENDING"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const storageObjects = pgTable("storage_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").references(() => investigations.id, { onDelete: "set null" }),
  evidenceId: text("evidence_id"),
  storageClass: storageClassEnum("storage_class").notNull(),
  bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  contentType: text("content_type").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  status: storageStatusEnum("status").notNull().default("AVAILABLE"),
  deletionPolicy: deletionPolicyEnum("deletion_policy").notNull().default("DELETABLE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("storage_objects_bucket_key_unique").on(table.bucket, table.objectKey)]);

export const acquisitionJobs = pgTable("acquisition_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  authorizationId: uuid("authorization_id").notNull().references(() => operationAuthorizations.id, { onDelete: "restrict" }),
  status: acquisitionStatusEnum("status").notNull().default("QUEUED"),
  sourceType: acquisitionSourceTypeEnum("source_type").notNull(),
  sourceIdentifier: text("source_identifier").notNull(),
  outputStorageObjectId: uuid("output_storage_object_id").references(() => storageObjects.id, { onDelete: "set null" }),
  sha256: text("sha256"),
  size: bigint("size", { mode: "number" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evidenceRecords = pgTable("evidence_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  acquisitionJobId: uuid("acquisition_job_id").notNull().references(() => acquisitionJobs.id, { onDelete: "cascade" }),
  masterStorageObjectId: uuid("master_storage_object_id").notNull().references(() => storageObjects.id, { onDelete: "restrict" }),
  sha256: text("sha256").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  status: evidenceStatusEnum("status").notNull().default("AVAILABLE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workingCopies = pgTable("working_copies", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  masterEvidenceId: uuid("master_evidence_id").notNull().references(() => evidenceRecords.id, { onDelete: "restrict" }),
  masterStorageObjectId: uuid("master_storage_object_id").notNull().references(() => storageObjects.id, { onDelete: "restrict" }),
  sourceMasterSha256: text("source_master_sha256").notNull(),
  workingCopySha256: text("working_copy_sha256").notNull().default(""),
  investigatorId: uuid("investigator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  authorizationId: uuid("authorization_id").notNull().references(() => operationAuthorizations.id, { onDelete: "restrict" }),
  storageObjectId: uuid("storage_object_id").notNull().references(() => storageObjects.id, { onDelete: "restrict" }),
  status: pgEnum("working_copy_status", ["QUEUED", "CREATING", "VERIFYING", "COMPLETED", "FAILED"])("status").notNull().default("QUEUED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
});

export const recoveredCandidates = pgTable("recovered_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  recoveryJobId: uuid("recovery_job_id").notNull().references(() => recoveryJobs.id, { onDelete: "cascade" }),
  workingCopyId: uuid("working_copy_id").notNull().references(() => workingCopies.id, { onDelete: "restrict" }),
  masterEvidenceId: uuid("master_evidence_id").notNull().references(() => evidenceRecords.id, { onDelete: "restrict" }),
  method: recoveryMethodEnum("method").notNull(),
  engine: recoveryEngineEnum("engine").notNull(),
  sourcePath: text("source_path"),
  sourceOffset: bigint("source_offset", { mode: "number" }),
  sourceMetadata: text("source_metadata"),
  recoveredPath: text("recovered_path"),
  size: bigint("size", { mode: "number" }),
  storageObjectId: uuid("storage_object_id").references(() => storageObjects.id, { onDelete: "set null" }),
  provisionalSha256: text("provisional_sha256"),
  status: candidateStatusEnum("status").notNull().default("PENDING"),
  provenance: jsonb("provenance").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryCertificates = pgTable("recovery_certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  recoveredCandidateId: uuid("recovered_candidate_id").notNull().references(() => recoveredCandidates.id, { onDelete: "cascade" }),
  recoveryJobId: uuid("recovery_job_id").notNull().references(() => recoveryJobs.id, { onDelete: "cascade" }),
  workingCopyId: uuid("working_copy_id").notNull().references(() => workingCopies.id, { onDelete: "restrict" }),
  masterEvidenceId: uuid("master_evidence_id").notNull().references(() => evidenceRecords.id, { onDelete: "restrict" }),
  artifactStorageObjectId: uuid("artifact_storage_object_id").notNull().references(() => storageObjects.id, { onDelete: "restrict" }),
  artifactSize: bigint("artifact_size", { mode: "number" }),
  artifactSha256: text("artifact_sha256"),
  payload: jsonb("payload").notNull().default({}),
  payloadHash: text("payload_hash"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  recoverySignature: text("recovery_signature"),
  recoverySignerId: uuid("recovery_signer_id").references(() => users.id, { onDelete: "set null" }),
  validationSignature: text("validation_signature"),
  validationSignerId: uuid("validation_signer_id").references(() => users.id, { onDelete: "set null" }),
  status: pgEnum("recovery_certificate_status", ["GENERATED", "READY_FOR_VALIDATION", "VALIDATED", "VALIDATION_FAILED"])("status").notNull().default("GENERATED"),
  validationDetails: jsonb("validation_details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sanitization_certificates = pgTable("sanitization_certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  sanitizationJobId: uuid("sanitization_job_id").notNull().references(() => sanitization_jobs.id, { onDelete: "cascade" }),
  authorizationId: uuid("authorization_id").notNull().references(() => operationAuthorizations.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetReference: text("target_reference").notNull(),
  targetStableIdentifier: text("target_stable_identifier"),
  storageMetadata: jsonb("storage_metadata").notNull().default({}),
  sanitizationMethod: sanitizationMethodEnum("sanitization_method").notNull(),
  bytesAffected: bigint("bytes_affected", { mode: "number" }),
  verificationResult: text("verification_result"),
  verificationDetails: jsonb("verification_details").notNull().default({}),
  performerId: uuid("performer_id").references(() => users.id, { onDelete: "set null" }),
  payload: jsonb("payload").notNull().default({}),
  payloadHash: text("payload_hash"),
  signature: text("signature"),
  signerId: uuid("signer_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sanitization_jobs = pgTable("sanitization_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  authorizationId: uuid("authorization_id").notNull().references(() => operationAuthorizations.id, { onDelete: "restrict" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetReference: text("target_reference").notNull(),
  targetStableIdentifier: text("target_stable_identifier"),
  storageType: text("storage_type"),
  sanitizationMethod: sanitizationMethodEnum("sanitization_method").notNull(),
  status: sanitizationJobStatusEnum("status").notNull().default("QUEUED"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  bytesAffected: bigint("bytes_affected", { mode: "number" }),
  verificationStatus: text("verification_status"),
  verificationHash: text("verification_hash"),
  verificationDetails: jsonb("verification_details").notNull().default({}),
  failureReason: text("failure_reason"),
  certificateId: uuid("certificate_id"),
  performerId: uuid("performer_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerEventStatusEnum = pgEnum("ledger_event_status", ["PENDING", "SUBMITTED", "CONFIRMED", "FAILED", "UNAVAILABLE"]);

export const ledger_events = pgTable("ledger_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  evidenceId: uuid("evidence_id").notNull().references(() => evidenceRecords.id, { onDelete: "cascade" }),
  acquisitionJobId: uuid("acquisition_job_id").notNull().references(() => acquisitionJobs.id, { onDelete: "cascade" }),
  sanitizationJobId: uuid("sanitization_job_id").references(() => sanitization_jobs.id, { onDelete: "set null" }),
  event_type: text("event_type").notNull(),
  event_hash: text("event_hash").notNull(),
  payload: jsonb("payload").notNull().default({}),
  network: text("network"),
  channel: text("channel"),
  chaincode: text("chaincode"),
  blockchain_tx_id: text("blockchain_tx_id"),
  status: ledgerEventStatusEnum("status").notNull().default("PENDING"),
  anchored_at: timestamp("anchored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("ledger_events_acq_unique").on(table.acquisitionJobId), uniqueIndex("ledger_events_sanitization_unique").on(table.sanitizationJobId)]);

export const recoveryJobs = pgTable("recovery_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  workingCopyId: uuid("working_copy_id").notNull().references(() => workingCopies.id, { onDelete: "restrict" }),
  masterEvidenceId: uuid("master_evidence_id").notNull().references(() => evidenceRecords.id, { onDelete: "restrict" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  authorizationId: uuid("authorization_id").notNull().references(() => operationAuthorizations.id, { onDelete: "restrict" }),
  status: recoveryJobStatusEnum("status").notNull().default("QUEUED"),
  method: recoveryMethodEnum("method").notNull(),
  engine: recoveryEngineEnum("engine").notNull(),
  config: jsonb("config").notNull().default({}),
  outputLocation: text("output_location"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id").references(() => investigations.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  acquisitionJobId: uuid("acquisition_job_id").references(() => acquisitionJobs.id, { onDelete: "cascade" }),
  authorizationId: uuid("authorization_id").references(() => operationAuthorizations.id, { onDelete: "set null" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  eventType: auditEventTypeEnum("event_type").notNull(),
  result: text("result").notNull().default("SUCCESS"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  investigations: many(investigations),
  requestedAuthorizations: many(operationAuthorizations, { relationName: "requestedAuthorizations" }),
  approvedAuthorizations: many(operationAuthorizations, { relationName: "approvedAuthorizations" }),
  acquisitionJobs: many(acquisitionJobs),
  auditEvents: many(auditEvents),
}));

export const investigationsRelations = relations(investigations, ({ one, many }) => ({
  creator: one(users, { fields: [investigations.createdBy], references: [users.id] }),
  devices: many(devices),
  authorizations: many(operationAuthorizations),
  storageObjects: many(storageObjects),
  acquisitionJobs: many(acquisitionJobs),
  evidenceRecords: many(evidenceRecords),
  auditEvents: many(auditEvents),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  investigation: one(investigations, { fields: [devices.investigationId], references: [investigations.id] }),
  authorizations: many(operationAuthorizations),
  acquisitionJobs: many(acquisitionJobs),
  evidenceRecords: many(evidenceRecords),
  auditEvents: many(auditEvents),
}));

export const operationAuthorizationsRelations = relations(operationAuthorizations, ({ one, many }) => ({
  investigation: one(investigations, {
    fields: [operationAuthorizations.investigationId],
    references: [investigations.id],
  }),
  device: one(devices, {
    fields: [operationAuthorizations.deviceId],
    references: [devices.id],
  }),
  requester: one(users, {
    fields: [operationAuthorizations.requestedBy],
    references: [users.id],
    relationName: "requestedAuthorizations",
  }),
  approver: one(users, {
    fields: [operationAuthorizations.approvedBy],
    references: [users.id],
    relationName: "approvedAuthorizations",
  }),
  acquisitionJobs: many(acquisitionJobs),
  recoveryJobs: many(recoveryJobs),
  auditEvents: many(auditEvents),
}));

export const storageObjectsRelations = relations(storageObjects, ({ one, many }) => ({
  investigation: one(investigations, {
    fields: [storageObjects.investigationId],
    references: [investigations.id],
  }),
  acquisitionJobs: many(acquisitionJobs),
  evidenceRecords: many(evidenceRecords),
  workingCopies: many(workingCopies),
}));

export const recoveryJobsRelations = relations(recoveryJobs, ({ one }) => ({
  investigation: one(investigations, {
    fields: [recoveryJobs.investigationId],
    references: [investigations.id],
  }),
  workingCopy: one(workingCopies, {
    fields: [recoveryJobs.workingCopyId],
    references: [workingCopies.id],
  }),
  masterEvidence: one(evidenceRecords, {
    fields: [recoveryJobs.masterEvidenceId],
    references: [evidenceRecords.id],
  }),
  requester: one(users, {
    fields: [recoveryJobs.requestedBy],
    references: [users.id],
  }),
  authorization: one(operationAuthorizations, {
    fields: [recoveryJobs.authorizationId],
    references: [operationAuthorizations.id],
  }),
}));

export const acquisitionJobsRelations = relations(acquisitionJobs, ({ one }) => ({
  investigation: one(investigations, {
    fields: [acquisitionJobs.investigationId],
    references: [investigations.id],
  }),
  device: one(devices, {
    fields: [acquisitionJobs.deviceId],
    references: [devices.id],
  }),
  requester: one(users, {
    fields: [acquisitionJobs.requestedBy],
    references: [users.id],
  }),
  authorization: one(operationAuthorizations, {
    fields: [acquisitionJobs.authorizationId],
    references: [operationAuthorizations.id],
  }),
  outputStorageObject: one(storageObjects, {
    fields: [acquisitionJobs.outputStorageObjectId],
    references: [storageObjects.id],
  }),
  evidence: one(evidenceRecords, {
    fields: [acquisitionJobs.id],
    references: [evidenceRecords.acquisitionJobId],
  }),
}));

export const evidenceRecordsRelations = relations(evidenceRecords, ({ one, many }) => ({
  investigation: one(investigations, {
    fields: [evidenceRecords.investigationId],
    references: [investigations.id],
  }),
  device: one(devices, {
    fields: [evidenceRecords.deviceId],
    references: [devices.id],
  }),
  acquisitionJob: one(acquisitionJobs, {
    fields: [evidenceRecords.acquisitionJobId],
    references: [acquisitionJobs.id],
  }),
  masterStorageObject: one(storageObjects, {
    fields: [evidenceRecords.masterStorageObjectId],
    references: [storageObjects.id],
  }),
  workingCopies: many(workingCopies),
  recoveryJobs: many(recoveryJobs),
}));

export const workingCopiesRelations = relations(workingCopies, ({ one, many }) => ({
  investigation: one(investigations, {
    fields: [workingCopies.investigationId],
    references: [investigations.id],
  }),
  masterEvidence: one(evidenceRecords, {
    fields: [workingCopies.masterEvidenceId],
    references: [evidenceRecords.id],
  }),
  masterStorageObject: one(storageObjects, {
    fields: [workingCopies.masterStorageObjectId],
    references: [storageObjects.id],
  }),
  investigator: one(users, {
    fields: [workingCopies.investigatorId],
    references: [users.id],
  }),
  authorization: one(operationAuthorizations, {
    fields: [workingCopies.authorizationId],
    references: [operationAuthorizations.id],
  }),
  storageObject: one(storageObjects, {
    fields: [workingCopies.storageObjectId],
    references: [storageObjects.id],
  }),
  recoveryJobs: many(recoveryJobs),
}));

export const recoveredCandidatesRelations = relations(recoveredCandidates, ({ one }) => ({
  investigation: one(investigations, { fields: [recoveredCandidates.investigationId], references: [investigations.id] }),
  recoveryJob: one(recoveryJobs, { fields: [recoveredCandidates.recoveryJobId], references: [recoveryJobs.id] }),
  workingCopy: one(workingCopies, { fields: [recoveredCandidates.workingCopyId], references: [workingCopies.id] }),
  masterEvidence: one(evidenceRecords, { fields: [recoveredCandidates.masterEvidenceId], references: [evidenceRecords.id] }),
  storageObject: one(storageObjects, { fields: [recoveredCandidates.storageObjectId], references: [storageObjects.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  investigation: one(investigations, {
    fields: [auditEvents.investigationId],
    references: [investigations.id],
  }),
  device: one(devices, {
    fields: [auditEvents.deviceId],
    references: [devices.id],
  }),
  acquisitionJob: one(acquisitionJobs, {
    fields: [auditEvents.acquisitionJobId],
    references: [acquisitionJobs.id],
  }),
  authorization: one(operationAuthorizations, {
    fields: [auditEvents.authorizationId],
    references: [operationAuthorizations.id],
  }),
  actor: one(users, {
    fields: [auditEvents.actorId],
    references: [users.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type InvestigationRow = typeof investigations.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type OperationAuthorizationRow = typeof operationAuthorizations.$inferSelect;
export type StorageObjectRow = typeof storageObjects.$inferSelect;
export type AcquisitionJobRow = typeof acquisitionJobs.$inferSelect;
export type EvidenceRecordRow = typeof evidenceRecords.$inferSelect;
export type WorkingCopyRow = typeof workingCopies.$inferSelect;
export type SanitizationJobRow = typeof sanitization_jobs.$inferSelect;
export type SanitizationCertificateRow = typeof sanitization_certificates.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type RecoveryCertificateRow = typeof recoveryCertificates.$inferSelect;
export type LedgerEventRow = typeof ledger_events.$inferSelect;
