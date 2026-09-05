import fs from "node:fs/promises";
import { createPrivateKey, KeyObject } from "node:crypto";

import type { LedgerAdapter, LedgerAdapterResult } from "./ledger";

import { connect, signers, hash, type ConnectOptions } from "@hyperledger/fabric-gateway";
import * as grpc from "@grpc/grpc-js";

type Env = Record<string, string | undefined>;

function missingEnv(key: string) {
  return new Error(`Fabric configuration missing required env var: ${key}`);
}

export async function createFabricAdapter(env: Env = process.env): Promise<LedgerAdapter> {
  const gatewayUrl = env.FABRIC_GATEWAY_URL;
  const mspId = env.FABRIC_MSP_ID;
  const certPath = env.FABRIC_IDENTITY_CERT_PATH;
  const keyPath = env.FABRIC_IDENTITY_PRIVATE_KEY_PATH;
  const tlsRootCert = env.FABRIC_TLS_ROOT_CERT_PATH;
  const channel = env.FABRIC_CHANNEL;
  const chaincode = env.FABRIC_CHAINCODE;
  const nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  const allowInsecure = env.FABRIC_ALLOW_INSECURE_TLS === "true";

  // If essential env vars are not present, return an adapter that reports UNAVAILABLE.
  if (!gatewayUrl || !mspId || !certPath || !keyPath || !channel || !chaincode) {
    return {
      async recordEvent(_payload: any): Promise<LedgerAdapterResult> {
        return { status: "UNAVAILABLE", error: "Fabric not configured (missing env)" };
      },
      async getEvent(_id: string): Promise<any> {
        throw missingEnv("FABRIC_* variables");
      },
    };
  }

  // Enforce TLS in production. For non-production, allow an explicit override
  // via FABRIC_ALLOW_INSECURE_TLS=true (must be intentional).
  if (nodeEnv === "production" && !tlsRootCert) {
    return {
      async recordEvent(_payload: any): Promise<LedgerAdapterResult> {
        return { status: "UNAVAILABLE", error: "FABRIC_TLS_ROOT_CERT_PATH is required in production" };
      },
      async getEvent(_id: string): Promise<any> {
        throw new Error("FABRIC_TLS_ROOT_CERT_PATH is required in production");
      },
    };
  }

  // Gate real Fabric network/client initialization behind an explicit
  // integration flag. Unit tests must not attempt network I/O or load
  // heavy client packages; those tests validate configuration only.
  const integrationEnabled = env.FORENSIC_X_FABRIC_INTEGRATION === "true";
  if (!integrationEnabled) {
    return {
      async recordEvent(_payload: any): Promise<LedgerAdapterResult> {
        return { status: "UNAVAILABLE", error: "Fabric integration disabled (FORENSIC_X_FABRIC_INTEGRATION not set)" };
      },
      async getEvent(_id: string): Promise<any> {
        throw new Error("Fabric integration disabled (FORENSIC_X_FABRIC_INTEGRATION not set)");
      },
    };
  }

  // Read identity materials (only when integration is enabled)
  const certPem = await fs.readFile(certPath, "utf8");
  const keyPem = await fs.readFile(keyPath, "utf8");

  // TLS root cert (optional in dev, required in production)
  const tlsRoot = tlsRootCert ? await fs.readFile(tlsRootCert) : null;

  // In non-production allow explicit insecure connections only when allowed.
  if (!tlsRoot && nodeEnv !== "production" && !allowInsecure) {
    return {
      async recordEvent(_payload: any): Promise<LedgerAdapterResult> {
        return { status: "UNAVAILABLE", error: "FABRIC_TLS_ROOT_CERT_PATH not set; set FABRIC_ALLOW_INSECURE_TLS=true to allow insecure connections in non-production" };
      },
      async getEvent(_id: string): Promise<any> {
        throw new Error("FABRIC_TLS_ROOT_CERT_PATH not set; set FABRIC_ALLOW_INSECURE_TLS=true to allow insecure connections in non-production");
      },
    };
  }

  // Create grpc client with TLS when root cert provided, otherwise insecure only when allowed.
  const credentials = tlsRoot ? grpc.credentials.createSsl(tlsRoot) : grpc.credentials.createInsecure();
  const client = new grpc.Client(gatewayUrl, credentials, { "grpc.max_receive_message_length": -1 });

  // Build identity and signer per gateway SDK
  const identity = { mspId, credentials: Buffer.from(certPem, "utf8") };
  const privateKey: KeyObject = createPrivateKey({ key: keyPem, format: "pem" });
  const signer = signers.newPrivateKeySigner(privateKey);

  const gateway = connect({ client, identity, signer, hash: hash.sha256 } as ConnectOptions);

  // Return an adapter that uses the gateway to submit transactions.
  return {
    async recordEvent(payload: any): Promise<LedgerAdapterResult> {
      try {
        const network = gateway.getNetwork(channel);
        const contract = network.getContract(chaincode);

        // Prefer the Gateway async submit flow which returns a commit handle
        // with a getStatus() method.
        if (typeof contract.submitAsync === "function") {
          try {
            const commit = await contract.submitAsync("RecordAcquisitionEvent", { arguments: [JSON.stringify(payload)] });
            const txId = typeof commit?.getTransactionId === "function" ? commit.getTransactionId() : undefined;
            if (!commit || typeof commit.getStatus !== "function") {
              return { status: "FAILED", txId, error: "commit object missing getStatus() - incompatible Gateway SDK" };
            }
            const status = await commit.getStatus();
            if (status && status.successful) return { status: "CONFIRMED", txId, error: undefined };
            return { status: "FAILED", txId, error: "transaction commit failed" };
          } catch (err: any) {
            const txId = err && typeof err.getTransactionId === "function" ? err.getTransactionId() : undefined;
            return { status: "FAILED", txId, error: err?.message ?? String(err) };
          }
        }

        // If submitAsync is not available on the contract, return UNAVAILABLE.
        return { status: "UNAVAILABLE", error: "Gateway SDK missing submitAsync/commit.getStatus APIs" };
      } catch (err: any) {
        return { status: "FAILED", error: err?.message ?? String(err) };
      }
    },
    async getEvent(id: string): Promise<any> {
      try {
        const network = gateway.getNetwork(channel);
        const contract = network.getContract(chaincode);
        const result = await contract.evaluateTransaction("GetAcquisitionEvent", id);
        if (!result) return null;
        try {
          return JSON.parse(result.toString());
        } catch {
          return { raw: result.toString() };
        }
      } catch (err) {
        throw err;
      }
    },
  };
}

export default createFabricAdapter;
