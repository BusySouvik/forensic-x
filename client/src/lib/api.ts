export type ApiRole = "ADMIN" | "INVESTIGATOR";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: ApiRole;
};

export type Investigation = {
  id: string;
  investigationNumber: string;
  title: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED" | "ARCHIVED";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Device = {
  id: string;
  investigationId: string;
  deviceIdentifier: string;
  deviceType: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
  connectionType?: string | null;
  status: "REGISTERED" | "IN_CUSTODY" | "RELEASED";
  createdAt: string;
};

export type Authorization = {
  id: string;
  investigationId: string;
  deviceId?: string | null;
  requestedBy: string;
  approvedBy?: string | null;
  operationType: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "REVOKED";
  requestedAt: string;
  approvedAt?: string | null;
  expiresAt?: string | null;
};

export type Workflow = {
  investigationId: string;
  acquisitionInvestigatorId: string;
  recoveryInvestigatorId: string;
  validationInvestigatorId: string;
  analysisInvestigatorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AcquisitionJob = {
  id: string;
  investigationId: string;
  deviceId?: string | null;
  requestedBy: string;
  authorizationId: string;
  status: string;
  sourceType: string;
  sourceIdentifier: string;
  outputStorageObjectId?: string | null;
  sha256?: string | null;
  size?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkingCopy = {
  id: string;
  investigationId: string;
  masterEvidenceId: string;
  masterStorageObjectId: string;
  sourceMasterSha256: string;
  workingCopySha256: string;
  investigatorId: string;
  authorizationId: string;
  storageObjectId: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  failureReason?: string | null;
};

export type RecoveryJob = {
  id: string;
  investigationId: string;
  workingCopyId: string;
  requestedBy: string;
  authorizationId: string;
  method: string;
  engine: string;
  status: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type RecoveryCertificate = {
  id: string;
  investigationId: string;
  recoveredCandidateId: string;
  recoveryJobId: string;
  workingCopyId: string;
  masterEvidenceId: string;
  artifactStorageObjectId: string;
  artifactSize?: number | null;
  artifactSha256?: string | null;
  status: string;
  payloadHash?: string | null;
  recoverySignature?: string | null;
  validationSignature?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SanitizationJob = {
  id: string;
  investigationId: string;
  authorizationId: string;
  requestedBy: string;
  targetType: string;
  targetReference: string;
  sanitizationMethod: string;
  status: string;
  verificationStatus?: string | null;
  verificationHash?: string | null;
  certificateId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiResult<T> = { data: T; unavailable?: boolean; error?: string };

let accessToken: string | null = null;

export function clearAccessToken() {
  accessToken = null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export async function login(email: string, password: string) {
  const result = await request<{ token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  accessToken = result.token;
  return result;
}

export async function getCurrentUser() {
  return request<{ user: ApiUser }>("/auth/me");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  // The current backend does not expose a change-password route.
  throw new Error("CHANGE_PASSWORD_ENDPOINT_UNAVAILABLE");
}

export async function getHealth() {
  return request<{ status: string; service: string; timestamp: string }>("/health");
}

export async function listInvestigations() {
  return request<{ investigations: Investigation[] }>("/investigations");
}

export async function listInvestigators() {
  return request<{ users: Array<{ id: string; name: string }> }>("/admin/users");
}

export async function listAuthorizations(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ authorizations: Authorization[] }>(`/admin/authorizations${query}`);
}

export async function listInvestigationAuthorizations(investigationId: string) {
  return request<{ authorizations: Authorization[] }>(`/investigations/${investigationId}/authorizations`);
}

export async function decideAuthorization(id: string, decision: "approve" | "deny") {
  return request<{ authorization: Authorization }>(`/admin/authorizations/${id}/${decision}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listDevices(investigationId: string) {
  return request<{ devices: Device[] }>(`/investigations/${investigationId}/devices`);
}

export async function getWorkflow(investigationId: string) {
  return request<{ workflow: Workflow }>(`/investigations/${investigationId}/workflow`);
}

export async function saveWorkflow(investigationId: string, workflow: Omit<Workflow, "investigationId" | "version" | "createdAt" | "updatedAt">) {
  return request<{ workflow: Workflow }>(`/investigations/${investigationId}/workflow`, {
    method: "PUT",
    body: JSON.stringify(workflow),
  });
}

export async function listAcquisitions(investigationId: string) {
  return request<{ acquisitions: AcquisitionJob[] }>(`/acquisitions?investigationId=${encodeURIComponent(investigationId)}`);
}

export async function createWorkingCopy(masterEvidenceId: string, investigationId: string, authorizationId: string, investigatorId?: string) {
  return request<{ workingCopy: WorkingCopy }>(`/evidence/${masterEvidenceId}/working-copies`, {
    method: "POST",
    body: JSON.stringify({ investigationId, authorizationId, investigatorId }),
  });
}

export async function listWorkingCopies(investigationId: string) {
  return request<{ workingCopies: WorkingCopy[] }>(`/investigations/${investigationId}/working-copies`);
}

export async function listRecoveryJobs(investigationId: string) {
  return request<{ recoveryJobs: RecoveryJob[] }>(`/investigations/${investigationId}/recovery-jobs`);
}

export async function listRecoveryCertificates(investigationId: string) {
  return request<{ certificates: RecoveryCertificate[] }>(`/investigations/${investigationId}/certificates`);
}

export async function getRecoveryResults(investigationId: string, recoveryJobId: string) {
  return request<{ status: string; artifacts: unknown[]; message: string; generatedAt: string }>(`/investigations/${investigationId}/recovery-jobs/${recoveryJobId}/results`);
}

export async function startAnalysis(investigationId: string) {
  return request<unknown>(`/investigations/${investigationId}/analysis/start`, { method: "POST" });
}

export async function listSanitizationJobs(investigationId: string) {
  return request<{ sanitizationJobs: SanitizationJob[] }>(`/investigations/${investigationId}/sanitization/jobs`);
}
