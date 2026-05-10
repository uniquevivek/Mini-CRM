import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Paginated, Project, Task, TaskStatus, User } from '../types';

const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const [projPage, setProjPage] = useState(1);
  const [projSearch, setProjSearch] = useState('');
  const [projApplied, setProjApplied] = useState('');

  const [taskPage, setTaskPage] = useState(1);
  const [taskQ, setTaskQ] = useState('');
  const [taskQApplied, setTaskQApplied] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [filterAssignee, setFilterAssignee] = useState('');

  const projectsQuery = useQuery({
    queryKey: ['projects', projPage, projApplied],
    queryFn: () =>
      api<Paginated<Project>>(
        `/projects?page=${projPage}&limit=5&q=${encodeURIComponent(projApplied)}`
      ),
  });

  const tasksQuery = useQuery({
    queryKey: [
      'tasks',
      taskPage,
      taskQApplied,
      filterProjectId,
      filterStatus,
      filterAssignee,
    ],
    queryFn: () => {
      const p = new URLSearchParams({
        page: String(taskPage),
        limit: '8',
        q: taskQApplied,
      });
      if (filterProjectId) p.set('projectId', filterProjectId);
      if (filterStatus) p.set('status', filterStatus);
      if (filterAssignee) p.set('assigneeId', filterAssignee);
      return api<Paginated<Task>>(`/tasks?${p.toString()}`);
    },
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/auth/users'),
  });

  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const projectCreate = useMutation({
    mutationFn: () =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectForm.name,
          description: projectForm.description || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setProjectForm({ name: '', description: '' });
    },
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    projectId: '',
    assigneeId: '',
    status: 'TODO' as TaskStatus,
  });

  const taskCreate = useMutation({
    mutationFn: () =>
      api<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description || null,
          projectId: taskForm.projectId,
          assigneeId: taskForm.assigneeId || null,
          status: taskForm.status,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setTaskForm((f) => ({
        ...f,
        title: '',
        description: '',
        assigneeId: '',
        status: 'TODO',
      }));
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) =>
      api<unknown>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      api<unknown>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const [projectModal, setProjectModal] = useState<Project | null>(null);
  const [projectPatch, setProjectPatch] = useState({
    name: '',
    description: '',
  });

  const updateProject = useMutation({
    mutationFn: () =>
      api<Project>(`/projects/${projectModal!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: projectPatch.name,
          description: projectPatch.description || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setProjectModal(null);
    },
  });

  const [taskModal, setTaskModal] = useState<Task | null>(null);
  const [taskPatch, setTaskPatch] = useState({
    title: '',
    description: '',
    assigneeId: '',
    status: 'TODO' as TaskStatus,
  });

  const updateTaskFull = useMutation({
    mutationFn: () =>
      api<Task>(`/tasks/${taskModal!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: taskPatch.title,
          description: taskPatch.description || null,
          assigneeId: taskPatch.assigneeId || null,
          status: taskPatch.status,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setTaskModal(null);
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api<Task>(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  function submitProject(e: FormEvent) {
    e.preventDefault();
    projectCreate.mutate();
  }

  function submitTask(e: FormEvent) {
    e.preventDefault();
    taskCreate.mutate();
  }

  function canManageProject(p: Project) {
    return user?.role === 'ADMIN' || p.ownerId === user?.id;
  }

  function canDeleteTask(task: Task) {
    return (
      user?.role === 'ADMIN' ||
      task.project?.ownerId === user?.id
    );
  }

  /** Project owner / admin — full task & project edits. */
  function canFullyManageTask(task: Task) {
    return canDeleteTask(task);
  }

  function openProjectModal(p: Project) {
    setProjectPatch({ name: p.name, description: p.description ?? '' });
    setProjectModal(p);
  }

  function openTaskModal(t: Task) {
    setTaskPatch({
      title: t.title,
      description: t.description ?? '',
      assigneeId: t.assigneeId ?? '',
      status: t.status,
    });
    setTaskModal(t);
  }

  const projects = projectsQuery.data?.data ?? [];
  const manageableProjects = useMemo(
    () =>
      projects.filter(
        (p) => user?.role === 'ADMIN' || p.ownerId === user?.id
      ),
    [projects, user?.id, user?.role]
  );

  useEffect(() => {
    if (manageableProjects.length === 0) {
      setTaskForm((f) => ({ ...f, projectId: '' }));
      return;
    }
    setTaskForm((f) => {
      if (manageableProjects.some((p) => p.id === f.projectId)) return f;
      return { ...f, projectId: manageableProjects[0].id };
    });
  }, [manageableProjects]);

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <Link to="/dashboard" className="logo">
            Mini CRM
          </Link>
          <span className="badge">{user?.role}</span>
        </div>
        <div className="user-menu">
          <span className="muted">{user?.name}</span>
          <button type="button" className="btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="main grid-dashboard">
        <section className="card section">
          <div className="section-head">
            <h2>Projects</h2>
            <p className="muted small">
              {user?.role === 'ADMIN'
                ? 'View all projects. Create owned projects.'
                : 'Owned projects plus projects where you have assigned tasks.'}
            </p>
          </div>

          <form
            className="row-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              setProjPage(1);
              setProjApplied(projSearch);
            }}
          >
            <input
              placeholder="Search name or description…"
              value={projSearch}
              onChange={(e) => setProjSearch(e.target.value)}
              className="grow"
            />
            <button type="submit" className="btn">
              Search
            </button>
          </form>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Tasks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.description ? (
                        <div className="muted small line-clamp">
                          {p.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{p.owner?.name ?? '—'}</td>
                    <td>{p._count?.tasks ?? '—'}</td>
                    <td className="actions">
                      <div className="row-actions">
                        {canManageProject(p) ? (
                          <>
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => openProjectModal(p)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn danger small"
                              onClick={() => {
                                if (
                                  confirm(
                                    'Delete this project and all tasks?'
                                  )
                                )
                                  deleteProject.mutate(p.id);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted center">
                      No projects yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination
            page={projPage}
            totalPages={projectsQuery.data?.meta.totalPages ?? 1}
            onPage={setProjPage}
          />

          <h3 className="subheading">Create project</h3>
          <form className="stack small" onSubmit={submitProject}>
            <label>
              Name
              <input
                required
                value={projectForm.name}
                onChange={(e) =>
                  setProjectForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={2}
                value={projectForm.description}
                onChange={(e) =>
                  setProjectForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
            <button
              type="submit"
              className="btn primary"
              disabled={projectCreate.isPending}
            >
              {projectCreate.isPending ? 'Saving…' : 'Create project'}
            </button>
            {projectCreate.isError ? (
              <div className="alert error small">
                {projectCreate.error.message}
              </div>
            ) : null}
          </form>
        </section>

        <section className="card section">
          <div className="section-head">
            <h2>Tasks</h2>
            <p className="muted small">
              Filter by project, status, assignee; update status anytime.
            </p>
          </div>

          <form
            className="filters stack small"
            onSubmit={(e) => {
              e.preventDefault();
              setTaskPage(1);
              setTaskQApplied(taskQ);
            }}
          >
            <div className="row-wrap">
              <input
                placeholder="Search title or description…"
                value={taskQ}
                onChange={(e) => setTaskQ(e.target.value)}
                className="grow"
              />
              <button type="submit" className="btn">
                Apply
              </button>
            </div>
            <div className="row-wrap trio">
              <label className="inline">
                Project
                <select
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                >
                  <option value="">All visible</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline">
                Status
                <select
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus((e.target.value as TaskStatus) || '')
                  }
                >
                  <option value="">Any</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline">
                Assignee
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                >
                  <option value="">Anyone</option>
                  {(usersQuery.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </form>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(tasksQuery.data?.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.title}</strong>
                      {t.description ? (
                        <div className="muted small line-clamp">
                          {t.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{t.project?.name ?? '—'}</td>
                    <td>{t.assignee?.name ?? '—'}</td>
                    <td>
                      <select
                        value={t.status}
                        onChange={(e) =>
                          updateTaskStatus.mutate({
                            id: t.id,
                            status: e.target.value as TaskStatus,
                          })
                        }
                        aria-label={`Status for ${t.title}`}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="actions">
                      <div className="row-actions">
                        {canFullyManageTask(t) ? (
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => openTaskModal(t)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canDeleteTask(t) ? (
                          <button
                            type="button"
                            className="btn danger small"
                            onClick={() => {
                              if (confirm('Delete this task?'))
                                deleteTask.mutate(t.id);
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {(tasksQuery.data?.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted center">
                      No tasks match filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination
            page={taskPage}
            totalPages={tasksQuery.data?.meta.totalPages ?? 1}
            onPage={setTaskPage}
          />

          <h3 className="subheading">Create task</h3>
          <form className="stack small" onSubmit={submitTask}>
            <label>
              Project
              <select
                required
                value={taskForm.projectId}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, projectId: e.target.value }))
                }
              >
                <option value="" disabled={manageableProjects.length > 0}>
                  Select project
                </option>
                {manageableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                required
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={2}
                value={taskForm.description}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
            <label>
              Assignee
              <select
                value={taskForm.assigneeId}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, assigneeId: e.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {(usersQuery.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Initial status
              <select
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm((f) => ({
                    ...f,
                    status: e.target.value as TaskStatus,
                  }))
                }
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn primary"
              disabled={
                taskCreate.isPending || manageableProjects.length === 0
              }
            >
              {taskCreate.isPending ? 'Saving…' : 'Create task'}
            </button>
            {manageableProjects.length === 0 ? (
              <p className="muted small">
                You need to own a project (or log in as admin) to create tasks.
              </p>
            ) : null}
            {taskCreate.isError ? (
              <div className="alert error small">
                {taskCreate.error.message}
              </div>
            ) : null}
          </form>
        </section>
      </main>

      {projectModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setProjectModal(null)}
        >
          <div
            className="modal card"
            role="dialog"
            aria-labelledby="edit-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-project-title">Edit project</h3>
            <form
              className="stack small"
              onSubmit={(e) => {
                e.preventDefault();
                updateProject.mutate();
              }}
            >
              <label>
                Name
                <input
                  required
                  value={projectPatch.name}
                  onChange={(e) =>
                    setProjectPatch((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={projectPatch.description}
                  onChange={(e) =>
                    setProjectPatch((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              {updateProject.isError ? (
                <div className="alert error small">
                  {updateProject.error.message}
                </div>
              ) : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setProjectModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={updateProject.isPending}
                >
                  {updateProject.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {taskModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setTaskModal(null)}
        >
          <div
            className="modal card"
            role="dialog"
            aria-labelledby="edit-task-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-task-title">Edit task</h3>
            <form
              className="stack small"
              onSubmit={(e) => {
                e.preventDefault();
                updateTaskFull.mutate();
              }}
            >
              <label>
                Title
                <input
                  required
                  value={taskPatch.title}
                  onChange={(e) =>
                    setTaskPatch((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={taskPatch.description}
                  onChange={(e) =>
                    setTaskPatch((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Assignee
                <select
                  value={taskPatch.assigneeId}
                  onChange={(e) =>
                    setTaskPatch((f) => ({ ...f, assigneeId: e.target.value }))
                  }
                >
                  <option value="">Unassigned</option>
                  {(usersQuery.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={taskPatch.status}
                  onChange={(e) =>
                    setTaskPatch((f) => ({
                      ...f,
                      status: e.target.value as TaskStatus,
                    }))
                  }
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {updateTaskFull.isError ? (
                <div className="alert error small">
                  {updateTaskFull.error.message}
                </div>
              ) : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setTaskModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={updateTaskFull.isPending}
                >
                  {updateTaskFull.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="pager">
      <button
        type="button"
        className="btn ghost"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="muted small">
        Page {page} / {totalPages}
      </span>
      <button
        type="button"
        className="btn ghost"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
