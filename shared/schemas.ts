import { z } from "zod";
import {
  ACQUISITION_SOURCE_TYPES,
  AUTHORIZATION_STATUSES,
  CONNECTION_TYPES,
  DEVICE_STATUSES,
  DEVICE_TYPES,
  INVESTIGATION_STATUSES,
  OPERATION_TYPES,
  RECOVERY_ENGINES,
  RECOVERY_METHODS,
  SANITIZATION_METHODS,
  USER_ROLES,
} from "./types";

export const uuidSchema = z.uuid();

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const bootstrapAdminSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
});

export const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  role: z.enum(USER_ROLES),
});

export const createInvestigatorSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  password: z.string().min(8),
  investigatorId: z.string().trim().min(1).max(64),
  contactNumber: z.string().trim().min(1).max(40),
  designation: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(120),
  specialization: z.string().trim().max(160).optional().nullable(),
  joiningDate: z.iso.datetime().optional().nullable(),
});

export const investigatorUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.email().optional(),
  contactNumber: z.string().trim().min(1).max(40).optional(),
  designation: z.string().trim().min(1).max(120).optional(),
  department: z.string().trim().min(1).max(120).optional(),
  specialization: z.string().trim().max(160).optional().nullable(),
  joiningDate: z.iso.datetime().optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const investigatorStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const createInvestigationSchema = z.object({
  investigationNumber: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional().default(""),
  status: z.enum(INVESTIGATION_STATUSES).optional().default("OPEN"),
});

export const updateInvestigationSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(10000).optional(),
    status: z.enum(INVESTIGATION_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const createDeviceSchema = z.object({
  deviceIdentifier: z.string().min(1).max(128),
  deviceType: z.enum(DEVICE_TYPES),
  manufacturer: z.string().max(120).optional().nullable(),
  model: z.string().max(120).optional().nullable(),
  serialNumber: z.string().max(120).optional().nullable(),
  capacity: z.string().max(64).optional().nullable(),
  connectionType: z.enum(CONNECTION_TYPES).optional().nullable(),
  status: z.enum(DEVICE_STATUSES).optional().default("REGISTERED"),
});

export const createAuthorizationSchema = z.object({
  deviceId: uuidSchema.optional().nullable(),
  operationType: z.enum(OPERATION_TYPES),
  reason: z.string().min(1).max(5000),
  expiresAt: z.iso.datetime().optional().nullable(),
});

export const decideAuthorizationSchema = z.object({
  expiresAt: z.iso.datetime().optional().nullable(),
});

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const investigationIdParamSchema = z.object({
  investigationId: uuidSchema,
});

export const configureInvestigationWorkflowSchema = z.object({
  acquisitionInvestigatorId: uuidSchema,
  recoveryInvestigatorId: uuidSchema,
  validationInvestigatorId: uuidSchema,
  analysisInvestigatorId: uuidSchema,
});

export const storageSampleSchema = z.object({
  investigationId: uuidSchema.optional().nullable(),
  evidenceId: z.string().min(1).max(128).optional().nullable(),
});

export const createAcquisitionSchema = z.object({
  investigationId: uuidSchema,
  deviceId: uuidSchema.optional().nullable(),
  authorizationId: uuidSchema,
  sourceType: z.enum(ACQUISITION_SOURCE_TYPES),
  sourceIdentifier: z.string().min(1).max(2048),
});

export const acquisitionIdParamSchema = z.object({
  id: uuidSchema,
});

export const acquisitionListQuerySchema = z.object({
  investigationId: uuidSchema.optional().nullable(),
});

export const createRecoveryJobSchema = z.object({
  workingCopyId: uuidSchema,
  authorizationId: uuidSchema,
  method: z.enum(RECOVERY_METHODS),
  engine: z.enum(RECOVERY_ENGINES),
  config: z.record(z.string(), z.any()).optional().default({}),
});

export const recoveryJobIdParamSchema = z.object({
  id: uuidSchema,
});

export const createRecoveryCertificateSchema = z.object({});

export const createSanitizationJobSchema = z.object({
  investigationId: uuidSchema,
  authorizationId: uuidSchema,
  targetType: z.enum(["FOLDER", "DEVICE", "EVIDENCE", "STORAGE_OBJECT"]),
  targetReference: z.string().min(1).max(2048),
  targetStableIdentifier: z.string().max(2048).optional().nullable(),
  storageType: z.string().max(255).optional().nullable(),
  sanitizationMethod: z.enum(SANITIZATION_METHODS),
});

export const validateCertificateSchema = z.object({});
