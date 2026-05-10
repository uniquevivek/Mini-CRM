import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { visibleProjectWhere, canManageProject, canAccessProject } from "../lib/access.js";
import { paginationSchema, projectCreateSchema, projectUpdateSchema } from "../validation/schemas.js";

const router = Router();
router.use(authMiddleware(true));

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const { page, limit } = paginationSchema.parse(req.query);
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const where = visibleProjectWhere(user, q);

    const [total, items] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { tasks: true } },
        },
      }),
    ]);

    res.json({
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!project || !(await canAccessProject(req.user!, project))) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(project);
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const body = projectCreateSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        ownerId: req.user!.id,
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    res.status(201).json(project);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const body = projectUpdateSchema.parse(req.body);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing || !(await canManageProject(req.user!, existing))) {
      return res.status(404).json({ error: "Project not found" });
    }
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    res.json(project);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing || !(await canManageProject(req.user!, existing))) {
      return res.status(404).json({ error: "Project not found" });
    }
    await prisma.project.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
