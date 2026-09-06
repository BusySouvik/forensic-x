import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { investigatorProfiles, users } from "../db/schema";
import { HttpError } from "../middleware/httpError";

const SALT_ROUNDS = 10;

type InvestigatorInput = {
  name: string;
  email: string;
  password: string;
  investigatorId: string;
  contactNumber: string;
  designation: string;
  department: string;
  specialization?: string | null;
  joiningDate?: string | null;
};

const investigatorProjection = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  investigatorId: investigatorProfiles.investigatorId,
  contactNumber: investigatorProfiles.contactNumber,
  designation: investigatorProfiles.designation,
  department: investigatorProfiles.department,
  specialization: investigatorProfiles.specialization,
  joiningDate: investigatorProfiles.joiningDate,
  status: investigatorProfiles.status,
};

export async function listInvestigators() {
  const db = getDb();
  return db.select(investigatorProjection).from(users).leftJoin(investigatorProfiles, eq(investigatorProfiles.userId, users.id)).where(eq(users.role, "INVESTIGATOR"));
}

export async function getInvestigator(id: string) {
  const db = getDb();
  const [investigator] = await db.select(investigatorProjection).from(users).leftJoin(investigatorProfiles, eq(investigatorProfiles.userId, users.id)).where(and(eq(users.id, id), eq(users.role, "INVESTIGATOR"))).limit(1);
  if (!investigator) throw new HttpError(404, "Investigator not found");
  return investigator;
}

export async function createInvestigator(input: InvestigatorInput) {
  const db = getDb();
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email: input.email.toLowerCase(), passwordHash, name: input.name, role: "INVESTIGATOR" }).returning();
      if (!user) throw new HttpError(500, "Failed to create investigator account");
      const [profile] = await tx.insert(investigatorProfiles).values({ userId: user.id, investigatorId: input.investigatorId, contactNumber: input.contactNumber, designation: input.designation, department: input.department, specialization: input.specialization || null, joiningDate: input.joiningDate ? new Date(input.joiningDate) : null }).returning();
      if (!profile) throw new HttpError(500, "Failed to create investigator profile");
      return user;
    });
    return getInvestigator(created.id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "An account or investigator ID already exists");
    throw error;
  }
}

export async function updateInvestigator(id: string, input: Partial<Omit<InvestigatorInput, "password" | "investigatorId">>) {
  await getInvestigator(id);
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email.toLowerCase() } : {}), updatedAt: new Date() }).where(eq(users.id, id));
      await tx.update(investigatorProfiles).set({ ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}), ...(input.designation !== undefined ? { designation: input.designation } : {}), ...(input.department !== undefined ? { department: input.department } : {}), ...(input.specialization !== undefined ? { specialization: input.specialization } : {}), ...(input.joiningDate !== undefined ? { joiningDate: input.joiningDate ? new Date(input.joiningDate) : null } : {}), updatedAt: new Date() }).where(eq(investigatorProfiles.userId, id));
    });
    return getInvestigator(id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "An account or investigator ID already exists");
    throw error;
  }
}

export async function updateInvestigatorStatus(id: string, status: "ACTIVE" | "INACTIVE" | "ON_LEAVE") {
  await getInvestigator(id);
  const db = getDb();
  await db.update(investigatorProfiles).set({ status, updatedAt: new Date() }).where(eq(investigatorProfiles.userId, id));
  return getInvestigator(id);
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
