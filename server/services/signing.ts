import crypto from "node:crypto";

// Development-only signing abstraction. Replace with production-grade
// key management (HSM/PKI) for real deployments.

export type Signature = {
  algorithm: string;
  signature: string;
  signerId: string;
  timestamp: string;
};

function canonicalize(obj: unknown) {
  if (typeof obj === "string") return obj;
  try {
    return JSON.stringify(obj, Object.keys(obj as any).sort());
  } catch {
    return JSON.stringify(obj);
  }
}

export class SigningService {
  private readonly secret: string;

  constructor(secret = process.env.FORENSIC_X_SIGNING_SECRET ?? "dev-dev-dev-secret") {
    this.secret = secret;
  }

  // Compute a deterministic payload hash for canonical payloads
  computePayloadHash(payload: unknown) {
    const canon = canonicalize(payload);
    return crypto.createHash("sha256").update(canon).digest("hex");
  }

  // Sign a payload, binding the signer identity into the signed input.
  signPayload(signerId: string, payload: unknown): Signature {
    const canon = canonicalize(payload);
    const input = `${signerId}|${canon}`;
    const hmac = crypto.createHmac("sha256", this.secret).update(input).digest("hex");
    return { algorithm: "HMAC-SHA256", signature: hmac, signerId, timestamp: new Date().toISOString() };
  }

  verifyPayload(signerId: string, payload: unknown, signature: string) {
    const canon = canonicalize(payload);
    const input = `${signerId}|${canon}`;
    const expected = crypto.createHmac("sha256", this.secret).update(input).digest("hex");
    return expected === signature;
  }
}

export const signingService = new SigningService();
