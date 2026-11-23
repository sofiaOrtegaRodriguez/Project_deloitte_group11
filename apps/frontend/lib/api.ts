/** Error returned by the Hosstock backend, with the message meant for the User. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The API path that failed, e.g. `/auth/me`. */
    readonly path: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * True when the session is missing, expired or no longer valid (for example the User was removed).
   * A 401 from the login form itself only means wrong credentials, so it doesn't count.
   */
  get isSessionLost(): boolean {
    return this.status === 401 && this.path !== '/auth/login';
  }
}

/**
 * Calls the backend REST API (same origin: Next forwards /api/* to the backend).
 * The session travels in an httpOnly cookie, which the browser sends automatically.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(res.status, message ?? 'Something went wrong. Please try again.', path);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
