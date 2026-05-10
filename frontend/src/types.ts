export type Role = 'ADMIN' | 'USER';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string; email: string };
  _count?: { tasks: number };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  projectId: string;
  assigneeId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; ownerId?: string };
  assignee?: { id: string; name: string; email: string } | null;
  createdBy?: { id: string; name: string; email: string };
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
