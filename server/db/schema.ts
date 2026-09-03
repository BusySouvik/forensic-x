import {
  bigint,
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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

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

export const usersRelations = relations(users, ({ many }) => ({
  investigations: many(investigations),
  requestedAuthorizations: many(operationAuthorizations, { relationName: "requestedAuthorizations" }),
  approvedAuthorizations: many(operationAuthorizations, { relationName: "approvedAuthorizations" }),
}));

export const investigationsRelations = relations(investigations, ({ one, many }) => ({
  creator: one(users, { fields: [investigations.createdBy], references: [users.id] }),
  devices: many(devices),
  authorizations: many(operationAuthorizations),
  storageObjects: many(storageObjects),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  investigation: one(investigations, { fields: [devices.investigationId], references: [investigations.id] }),
  authorizations: many(operationAuthorizations),
}));

export const operationAuthorizationsRelations = relations(operationAuthorizations, ({ one }) => ({
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
}));

export const storageObjectsRelations = relations(storageObjects, ({ one }) => ({
  investigation: one(investigations, {
    fields: [storageObjects.investigationId],
    references: [investigations.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type InvestigationRow = typeof investigations.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type OperationAuthorizationRow = typeof operationAuthorizations.$inferSelect;
export type StorageObjectRow = typeof storageObjects.$inferSelect;
