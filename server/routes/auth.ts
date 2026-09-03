import { Router, type Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import { bootstrapAdminSchema, createUserSchema, loginSchema } from "../../shared/schemas";
import { env } from "../config/env";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { bootstrapAdmin, createUserRecord, getUserById, login } from "../services/auth";

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
