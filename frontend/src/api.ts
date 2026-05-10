const TOKEN_KEY = 'mini_crm_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...options, headers });
  const raw = await parseJson<unknown>(res).catch(() => ({}));
  const data =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  if (!res.ok) {
    const msg =
      typeof data['error'] === 'string'
        ? data['error']
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}
