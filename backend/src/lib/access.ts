import { Role, type Project, type User } from "@prisma/client";
import { prisma } from "./prisma.js";

export function isAdmin(user: User) {
  return user.role === Role.ADMIN;
}

/** Projects visible on dashboard: admins see all; users see owned + projects where they have an assigned task. */
export function visibleProjectWhere(user: User, search?: string) {
  const q = search?.trim();
  const text =
    q && q.length
      ? {
          OR: [{ name: { contains: q } }, { description: { contains: q } }],
        }
      : null;

  if (isAdmin(user)) {
    return text ?? {};
  }

  const scope = {
    OR: [{ ownerId: user.id }, { tasks: { some: { assigneeId: user.id } } }],
  };
  if (!text) return scope;
  return { AND: [scope, text] };
}

export async function canAccessProject(user: User, project: Pick<Project, "id" | "ownerId">) {
  if (isAdmin(user)) return true;
  if (project.ownerId === user.id) return true;
  const assigned = await prisma.task.findFirst({
    where: { projectId: project.id, assigneeId: user.id },
  });
  return Boolean(assigned);
}

export async function canManageProject(user: User, project: Pick<Project, "ownerId">) {
  if (isAdmin(user)) return true;
  return project.ownerId === user.id;
}

export async function canManageTask(
  user: User,
  project: Pick<Project, "id" | "ownerId">,
  taskAssigneeId: string | null
) {
  if (await canManageProject(user, project)) return true;
  return taskAssigneeId === user.id;
}
