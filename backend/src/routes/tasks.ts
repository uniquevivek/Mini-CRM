import { TaskStatus } from "@prisma/client";
import { Router } from "express";
import type { AuthRequest } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  visibleProjectWhere,
  canManageProject,
  canAccessProject,
  canManageTask,
} from "../lib/access.js";
import { paginationSchema, taskCreateSchema, taskUpdateSchema } from "../validation/schemas.js";

const router = Router();
router.use(authMiddleware(true));

function taskSearchWhere(q?: string) {
  if (!q?.trim()) return {};
  const s = q.trim();
  return {
    OR: [{ title: { contains: s } }, { description: { contains: s } }],
  };
}

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const { page, limit } = paginationSchema.parse(req.query);
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const projectIdFilter = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const assigneeRaw = typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined;

    const projectWhere = visibleProjectWhere(user);
    const projectIds = (
      await prisma.project.findMany({
        where: projectWhere,
        select: { id: true },
      })
    ).map((p) => p.id);

    if (projectIds.length === 0) {
      return res.json({
        data: [],
        meta: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const status =
      statusRaw && Object.values(TaskStatus).includes(statusRaw as TaskStatus)
        ? (statusRaw as TaskStatus)
        : undefined;

    const where = {
      AND: [
        { projectId: { in: projectIds } },
        ...(projectIdFilter ? [{ projectId: projectIdFilter }] : []),
        ...(status ? [{ status }] : []),
        ...(assigneeRaw ? [{ assigneeId: assigneeRaw }] : []),
        taskSearchWhere(q),
      ],
    };

    const [total, items] = await prisma.$transaction([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          project: { select: { id: true, name: true, ownerId: true } },
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
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

router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const body = taskCreateSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!project || !(await canManageProject(req.user!, project))) {
      return res.status(403).json({ error: "Cannot create task in this project" });
    }
    if (body.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
      if (!assignee) {
        return res.status(400).json({ error: "Assignee not found" });
      }
    }
    const task = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? TaskStatus.TODO,
        projectId: body.projectId,
        assigneeId: body.assigneeId ?? null,
        createdById: req.user!.id,
      },
      include: {
        project: { select: { id: true, name: true, ownerId: true } },
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.status(201).json(task);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!task || !(await canAccessProject(req.user!, task.project))) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(task);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const body = taskUpdateSchema.parse(req.body);
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing || !(await canAccessProject(req.user!, existing.project))) {
      return res.status(404).json({ error: "Task not found" });
    }
    const canFull = await canManageTask(req.user!, existing.project, existing.assigneeId);
    if (!canFull) {
      if (body.title !== undefined || body.description !== undefined || body.assigneeId !== undefined) {
        return res.status(403).json({ error: "Only status can be updated by assignee" });
      }
    }
    if (body.assigneeId !== undefined && body.assigneeId !== null) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId } });
      if (!assignee) {
        return res.status(400).json({ error: "Assignee not found" });
      }
    }
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId }),
      },
      include: {
        project: { select: { id: true, name: true, ownerId: true } },
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.json(task);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!existing || !(await canManageProject(req.user!, existing.project))) {
      return res.status(404).json({ error: "Task not found" });
    }
    await prisma.task.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
