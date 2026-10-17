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
    throw new ApiError(response.status, await describe(response));
  }
  return (await response.json()) as T;
}

/** A JSON body on a request: PUT, POST or DELETE. */
export function send<T>(method: "PUT" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The server's own words when it gave some (FastAPI's `detail`), else the status. */
async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // not JSON
  }
  return `${response.status} ${response.statusText}`.trim();
}

export interface Health {
  status: string;
  version: string;
  protect_revision: string | null;
  decoders: string[];
  data_dir: string;
}

export interface Setup {
  server_url: string | null;
  protect_version: string | null;
  email: string | null;
  signed_in: boolean;
  token_expires_at: string | null;
}
