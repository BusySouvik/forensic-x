export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "INVESTIGATOR";
};

export type LoginResult = { token: string; user: ApiUser };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
  }
  return body as T;
}

export async function login(email: string, password: string) {
  return request<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser() {
  return request<{ user: ApiUser }>("/auth/me");
}

export async function listInvestigations() {
  return request<{ investigations: unknown[] }>("/investigations");
}

export async function listAuthorizations(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ authorizations: unknown[] }>(`/admin/authorizations${query}`);
}

export async function listDevices(investigationId: string) {
  return request<{ devices: unknown[] }>(`/investigations/${investigationId}/devices`);
}

export async function getWorkflow(investigationId: string) {
  return request<{ workflow: unknown }>(`/investigations/${investigationId}/workflow`);
}

export async function startAnalysis(investigationId: string) {
  return request<{ result?: unknown }>(`/investigations/${investigationId}/analysis/start`, { method: "POST" });
}
