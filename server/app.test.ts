import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { UserRole } from "../shared/types";

const app = createApp();
const TEST_SECRET = "test-jwt-secret-do-not-use-in-prod";

function authHeader(role: UserRole, userId = "11111111-1111-4111-8111-111111111111") {
  const token = jwt.sign(
    { sub: userId, email: `${role.toLowerCase()}@forensic-x.test`, role },
    TEST_SECRET,
    { expiresIn: "1h" },
  );
  return { Authorization: `Bearer ${token}` };
}

describe("GET /api/health", () => {
  it("returns ok without authentication", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("forensic-x");
  });
});

describe("authorization enforcement", () => {
  it("rejects protected investigation routes without a token", async () => {
    const response = await request(app).get("/api/investigations");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("rejects invalid bearer tokens", async () => {
    const response = await request(app)
      .get("/api/investigations")
      .set("Authorization", "Bearer not-a-valid-token");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid authentication token");
  });

  it("forbids investigators from listing admin authorizations", async () => {
    const response = await request(app)
      .get("/api/admin/authorizations")
      .set(authHeader("INVESTIGATOR"));
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Insufficient permissions");
  });

  it("forbids investigators from creating users", async () => {
    const response = await request(app)
      .post("/api/admin/users")
      .set(authHeader("INVESTIGATOR"))
      .send({
        email: "investigator2@forensic-x.test",
        password: "password123",
        name: "Second Investigator",
        role: "INVESTIGATOR",
      });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Insufficient permissions");
  });

  it("forbids investigators from approving authorizations", async () => {
    const response = await request(app)
      .post("/api/admin/authorizations/22222222-2222-4222-8222-222222222222/approve")
      .set(authHeader("INVESTIGATOR"))
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Insufficient permissions");
  });
});

describe("invalid request validation", () => {
  it("rejects an empty investigation payload", async () => {
    const response = await request(app)
      .post("/api/investigations")
      .set(authHeader("INVESTIGATOR"))
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
    expect(Array.isArray(response.body.details)).toBe(true);
  });

  it("rejects an invalid login payload", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "not-an-email",
      password: "",
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("rejects a non-uuid investigation id", async () => {
    const response = await request(app)
      .get("/api/investigations/not-a-uuid")
      .set(authHeader("ADMIN"));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("rejects a device payload missing required fields", async () => {
    const response = await request(app)
      .post("/api/investigations/33333333-3333-4333-8333-333333333333/devices")
      .set(authHeader("INVESTIGATOR"))
      .send({ manufacturer: "Example" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});

describe("storage API authorization", () => {
  it("rejects unauthenticated sample uploads", async () => {
    const response = await request(app).post("/api/internal/storage/sample").send({});
    expect(response.status).toBe(401);
  });

  it("forbids investigators from using the internal sample upload", async () => {
    const response = await request(app)
      .post("/api/internal/storage/sample")
      .set(authHeader("INVESTIGATOR"))
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Insufficient permissions");
  });
});
