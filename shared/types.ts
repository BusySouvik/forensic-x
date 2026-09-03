export const USER_ROLES = ["ADMIN", "INVESTIGATOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INVESTIGATION_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED", "ARCHIVED"] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const DEVICE_TYPES = ["HDD", "SSD", "NVME", "USB", "MOBILE", "OPTICAL", "OTHER"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_STATUSES = ["REGISTERED", "IN_CUSTODY", "RELEASED"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const CONNECTION_TYPES = ["SATA", "USB", "NVME", "NETWORK", "OTHER"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const OPERATION_TYPES = [
  "ACQUISITION",
  "RECOVERY",
  "EXAMINATION",
  "SANITIZATION",
  "EXPORT",
  "OTHER",
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const AUTHORIZATION_STATUSES = ["PENDING", "APPROVED", "DENIED", "EXPIRED", "REVOKED"] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export const STORAGE_CLASSES = [
  "FORENSIC_IMAGE",
  "WORKING_COPY",
  "RECOVERED_EVIDENCE",
  "CERTIFICATE",
] as const;
export type StorageClass = (typeof STORAGE_CLASSES)[number];

export const STORAGE_STATUSES = ["UPLOADING", "AVAILABLE", "MISSING", "DELETED"] as const;
export type StorageStatus = (typeof STORAGE_STATUSES)[number];

export const DELETION_POLICIES = ["DELETABLE", "MASTER_IMAGE_PROTECTED"] as const;
export type DeletionPolicy = (typeof DELETION_POLICIES)[number];

export type StorageObjectPublic = {
  id: string;
  investigationId: string | null;
  evidenceId: string | null;
  storageClass: StorageClass;
  bucket: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  sha256: string;
  status: StorageStatus;
  deletionPolicy: DeletionPolicy;
  createdAt: string;
};
