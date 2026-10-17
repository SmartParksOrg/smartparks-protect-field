/** One typed `fetch` wrapper for the local server's API, as Protect's `api/client.ts` is for
 * its server: pages and hooks call it inside a TanStack Query `queryFn`, there are no
 * per-domain API modules. The local server needs no token. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${response.status} ${response.statusText}`.trim());
  }
  return (await response.json()) as T;
}

export interface Health {
  status: string;
  version: string;
  protect_revision: string | null;
  data_dir: string;
}
