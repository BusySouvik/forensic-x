export const USER_ROLES = ["ADMIN", "INVESTIGATOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INVESTIGATION_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED", "ARCHIVED"] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];
export const WORKFLOW_STAGES = ["ACQUISITION", "RECOVERY", "VALIDATION", "ANALYSIS"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

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

export const ACQUISITION_STATUSES = [
  "QUEUED",
  "VALIDATING",
  "ACQUIRING",
  "VERIFYING",
  "UPLOADING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type AcquisitionStatus = (typeof ACQUISITION_STATUSES)[number];

export const ACQUISITION_SOURCE_TYPES = ["TEST_FILE", "DEVICE", "IMAGE_FILE"] as const;
export type AcquisitionSourceType = (typeof ACQUISITION_SOURCE_TYPES)[number];

export const WORKING_COPY_STATUSES = ["QUEUED", "CREATING", "VERIFYING", "COMPLETED", "FAILED"] as const;
export type WorkingCopyStatus = (typeof WORKING_COPY_STATUSES)[number];

export const RECOVERY_METHODS = ["FILESYSTEM", "CARVING", "STRING_SEARCH", "TIMELINE"] as const;
export type RecoveryMethod = (typeof RECOVERY_METHODS)[number];

export const RECOVERY_ENGINES = ["TSK", "FOREMOST", "BULK_EXTRACTOR", "CUSTOM"] as const;
export type RecoveryEngine = (typeof RECOVERY_ENGINES)[number];

export const RECOVERY_JOB_STATUSES = ["QUEUED", "VALIDATING", "RECOVERING", "COLLECTING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type RecoveryJobStatus = (typeof RECOVERY_JOB_STATUSES)[number];

export const SANITIZATION_METHODS = ["HDD_OVERWRITE", "SSD_SECURE_ERASE", "TEST_TRUNCATE"] as const;
export type SanitizationMethod = (typeof SANITIZATION_METHODS)[number];

export const SANITIZATION_JOB_STATUSES = [
  "QUEUED",
  "AUTHORIZED",
  "SANITIZING",
  "VERIFYING",
  "CERTIFICATE_READY",
  "COMPLETED",
  "CANCELLED",
  "SANITIZATION_FAILED",
  "VERIFICATION_FAILED",
  "CERTIFICATE_FAILED",
  "UNSUPPORTED_METHOD",
  "TARGET_MISMATCH",
] as const;
export type SanitizationJobStatus = (typeof SANITIZATION_JOB_STATUSES)[number];

export const AUDIT_EVENT_TYPES = ["REQUESTED", "AUTHORIZED", "STARTED", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

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
