import { Router } from "express";
import { Role } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword, signToken, verifyPassword } from "../lib/auth.js";
import { loginSchema, registerSchema } from "../validation/schemas.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        role: Role.USER,
      },
    });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authMiddleware(true), async (req: AuthRequest, res) => {
  const u = req.user!;
  return res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
  });
});

router.get("/users", authMiddleware(true), async (_req: AuthRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

export default router;
