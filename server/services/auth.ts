import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { getDb } from "../db";
import { users } from "../db/schema";
import { HttpError } from "../middleware/httpError";
import type { AuthTokenPayload } from "../middleware/auth";
import type { PublicUser, UserRole } from "../../shared/types";

const SALT_ROUNDS = 10;

export function toPublicUser(user: { id: string; email: string; name: string; role: UserRole }): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function signAccessToken(user: PublicUser): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export async function login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, "Invalid email or password");
  }
  const publicUser = toPublicUser(user);
  return { token: signAccessToken(publicUser), user: publicUser };
}

export async function bootstrapAdmin(input: { email: string; password: string; name: string }) {
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    throw new HttpError(409, "Bootstrap is only allowed when no users exist");
  }
  return createUserRecord({
    email: input.email,
    password: input.password,
    name: input.name,
    role: "ADMIN",
  });
}

export async function createUserRecord(input: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}): Promise<PublicUser> {
  const db = getDb();
  const email = input.email.toLowerCase();
  const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (duplicate) {
    throw new HttpError(409, "A user with this email already exists");
  }
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: input.name,
      role: input.role,
    })
    .returning();
  if (!created) {
    throw new HttpError(500, "Failed to create user");
  }
  return toPublicUser(created);
}

export async function getUserById(id: string): Promise<PublicUser> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  return toPublicUser(user);
}
