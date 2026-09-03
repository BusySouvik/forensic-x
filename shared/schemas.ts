import { z } from "zod";
import {
  AUTHORIZATION_STATUSES,
  CONNECTION_TYPES,
  DEVICE_STATUSES,
  DEVICE_TYPES,
  INVESTIGATION_STATUSES,
  OPERATION_TYPES,
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

export const storageSampleSchema = z.object({
  investigationId: uuidSchema.optional().nullable(),
  evidenceId: z.string().min(1).max(128).optional().nullable(),
});
