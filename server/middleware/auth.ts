import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "../../shared/const";
import type { UserRole } from "../../shared/types";
import { env } from "../config/env";
import { HttpError } from "./httpError";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readAccessToken(req);
    if (!token) {
      throw new HttpError(401, "Authentication required");
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (!payload.sub || !payload.email || (payload.role !== "ADMIN" && payload.role !== "INVESTIGATOR")) {
      throw new HttpError(401, "Invalid authentication token");
    }

    req.user = {
      sub: payload.sub,
      email: String(payload.email),
      role: payload.role,
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, "Invalid authentication token"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, "Insufficient permissions"));
      return;
    }
    next();
  };
}

function readAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const cookieToken = req.cookies?.[COOKIE_NAME];
  return typeof cookieToken === "string" ? cookieToken : undefined;
}
