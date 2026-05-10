import type { NextFunction, Request, Response } from "express";
import { Role, type User } from "@prisma/client";
import { verifyToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

export type AuthRequest = Request & { user?: User };

export function authMiddleware(required = true) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      if (!required) return next();
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        return res.status(401).json({ error: "Invalid session" });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user || user.role !== Role.ADMIN) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
