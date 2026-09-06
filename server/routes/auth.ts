import { Router, type Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import { bootstrapAdminSchema, createInvestigatorSchema, createUserSchema, idParamSchema, investigatorStatusSchema, investigatorUpdateSchema, loginSchema } from "../../shared/schemas";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { eq } from "drizzle-orm";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { bootstrapAdmin, createUserRecord, getUserById, login } from "../services/auth";
import { createInvestigator, getInvestigator, listInvestigators, updateInvestigator, updateInvestigatorStatus } from "../services/investigators";

export const authRouter = Router();

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: ONE_YEAR_MS,
    path: "/",
  });
}

authRouter.post(
  "/auth/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await login(req.body.email, req.body.password);
    setSessionCookie(res, result.token);
    res.json(result);
  }),
);

authRouter.post(
  "/auth/bootstrap",
  validate(bootstrapAdminSchema),
  asyncHandler(async (req, res) => {
    const user = await bootstrapAdmin(req.body);
    res.status(201).json({ user });
  }),
);

authRouter.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.user!.sub);
    res.json({ user });
  }),
);

authRouter.post(
  "/admin/users",
  requireAuth,
  requireRole("ADMIN"),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const user = await createUserRecord(req.body);
    res.status(201).json({ user });
  }),
);

const listInvestigatorsForAdmin = asyncHandler(async (_req, res) => {
    const { users } = await import("../db/schema");
    const { getDb } = await import("../db");
    const rows = await getDb().select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.role, "INVESTIGATOR"));
    res.json({ users: rows.map((r: any) => ({ id: r.id, name: r.name })) });
  });

authRouter.get("/admin/users", requireAuth, requireRole("ADMIN"), listInvestigatorsForAdmin);
authRouter.post("/admin/investigators", requireAuth, requireRole("ADMIN"), validate(createInvestigatorSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ investigator: await createInvestigator(req.body) });
}));
authRouter.get("/admin/investigators", requireAuth, requireRole("ADMIN"), asyncHandler(async (_req, res) => {
  res.json({ investigators: await listInvestigators() });
}));
authRouter.get("/admin/investigators/:id", requireAuth, requireRole("ADMIN"), validate(idParamSchema, "params"), asyncHandler(async (req, res) => {
  res.json({ investigator: await getInvestigator(req.params.id) });
}));
authRouter.put("/admin/investigators/:id", requireAuth, requireRole("ADMIN"), validate(idParamSchema, "params"), validate(investigatorUpdateSchema), asyncHandler(async (req, res) => {
  res.json({ investigator: await updateInvestigator(req.params.id, req.body) });
}));
authRouter.patch("/admin/investigators/:id/status", requireAuth, requireRole("ADMIN"), validate(idParamSchema, "params"), validate(investigatorStatusSchema), asyncHandler(async (req, res) => {
  res.json({ investigator: await updateInvestigatorStatus(req.params.id, req.body.status) });
}));
