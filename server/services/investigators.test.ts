import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { investigatorProfiles, users } from "../db/schema";
import { createInvestigator, getInvestigator, updateInvestigatorStatus } from "./investigators";

const email = "investigator-management@example.test";

beforeEach(async () => {
  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.delete(investigatorProfiles).where(eq(investigatorProfiles.userId, existing.id));
    await db.delete(users).where(eq(users.id, existing.id));
  }
});

describe("investigator management service", () => {
  it("creates a fixed-role investigator account and profile", async () => {
    const created = await createInvestigator({
      name: "Management Test Investigator",
      email,
      password: "temporary-password-123",
      investigatorId: "INV-MGMT-001",
      contactNumber: "+91 90000 00000",
      designation: "Digital Forensics Analyst",
      department: "Evidence Operations",
      specialization: "Disk imaging",
    });
    expect(created).toMatchObject({ email, role: "INVESTIGATOR", investigatorId: "INV-MGMT-001", status: "ACTIVE" });
    expect(created.passwordHash).toBeUndefined();
  });

  it("updates the persisted operational status without changing role", async () => {
    const created = await createInvestigator({ name: "Status Test Investigator", email, password: "temporary-password-123", investigatorId: "INV-MGMT-002", contactNumber: "9000000000", designation: "Analyst", department: "Unit" });
    const updated = await updateInvestigatorStatus(created.id, "ON_LEAVE");
    expect(updated).toMatchObject({ id: created.id, role: "INVESTIGATOR", status: "ON_LEAVE" });
    await expect(getInvestigator(created.id)).resolves.toMatchObject({ status: "ON_LEAVE" });
  });
});
