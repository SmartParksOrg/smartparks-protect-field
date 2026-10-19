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
export function send<T>(
  method: "PUT" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
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

/** The server right now (decision D18): answering or not, the sign-in still accepted or not. */
export interface Connection {
  online: boolean;
  checked_at: string;
  protect_version: string | null;
  account_ok: boolean | null;
  error: string | null;
}

export interface Bundle {
  present: boolean;
  project_id: string | null;
  project_name: string | null;
  generated_at: string | null;
  fetched_at: string | null;
  protect_version: string | null;
  server_url: string | null;
  devices: number;
  stations: number;
  entities: number;
  trackers_with_keys: number;
  credentials_included: boolean;
  stale: boolean;
  key_kept_in: string | null;
}

export interface Card {
  id: string;
  name: string;
  imported_at: string;
  station_eui: string | null;
  station_device_id: string | null;
  station_name: string | null;
  files: number;
  lines: number;
  frames: number;
  decoded: number;
  repeated: number;
  refused: number;
  unknown: number;
  line_errors: number;
  positions: number;
  measurements: number;
  states: number;
  events: number;
  skipped: string[];
}

export interface CardDetail extends Card {
  files_list: {
    id: string;
    name: string;
    folder: string;
    size: number;
    station_eui: string | null;
    lines: number;
    frames: number;
    errors: number;
  }[];
  trackers: {
    device_id: string;
    device_name: string;
    entity_id: string | null;
    frames: number;
    decoded: number;
    refused: number;
    repeated: number;
    positions: number;
    measurements: number;
    first_time: string | null;
    last_time: string | null;
  }[];
  failures: {
    line: number;
    file: string;
    dev_addr: string | null;
    device_name: string | null;
    status: string;
    code: string | null;
    reason: string | null;
  }[];
}

export interface Position {
  device_id: string;
  entity_id: string | null;
  time: string;
  lat: number;
  lon: number;
}

export interface UploadCard {
  card_id: string;
  name: string;
  station_name: string | null;
  station_eui: string | null;
  station_device_id: string | null;
  imported_at: string;
  files: number;
  pending: number;
  uploaded: number;
  duplicate: number;
  refused: number;
  failed: number;
  last_uploaded_at: string | null;
  last_problem: string | null;
}

export interface Uploads {
  cards: UploadCard[];
  pending: number;
  failed: number;
}

export interface UploadRun {
  attempted: number;
  uploaded: number;
  duplicate: number;
  refused: number;
  failed: number;
  skipped_no_station: number;
  stopped: string | null;
  state: Uploads;
}

export interface Tracker {
  device_id: string;
  device_name: string;
  entity_id: string | null;
  positions: number;
  measurements: number;
  first_time: string | null;
  last_time: string | null;
  last_lat: number | null;
  last_lon: number | null;
}

/** An LP0 address the cards hold frames for that no device of the bundle has (Protect's D338). */
export interface UnknownTracker {
  dev_addr: string;
  source_eui: string | null;
  frames: number;
  first_at: string | null;
  last_at: string | null;
  stations: string[];
}

/** A metric's definition from Protect's registry, carried in the bundle (Protect's D334). */
export interface MetricDefinition {
  key: string;
  label: string;
  unit: string | null;
  value_type: string;
  category: string;
  description: string | null;
}

export interface Metric {
  metric: string;
  count: number;
  first_time: string;
  last_time: string;
  latest: number | boolean | string | null;
}

export interface Measurement {
  time: string;
  value: number | boolean | string | null;
}

export interface FileRow {
  id: string;
  card_id: string;
  card_name: string;
  station_name: string | null;
  station_eui: string | null;
  imported_at: string;
  name: string;
  folder: string;
  size: number;
  lines: number;
  frames: number;
  errors: number;
  upload_status: string;
  upload_answer: string | null;
  uploaded_at: string | null;
  decoded: number;
  repeated: number;
  refused: number;
  unknown: number;
  positions: number;
  measurements: number;
}

export interface FileDetail extends FileRow {
  trackers: {
    device_id: string;
    device_name: string;
    frames: number;
    decoded: number;
    positions: number;
  }[];
  failures: {
    line: number;
    dev_addr: string | null;
    device_name: string | null;
    status: string;
    code: string | null;
    reason: string | null;
  }[];
}

/** A removable volume of this computer with the station files found on it (decision D16). */
export interface Volume {
  path: string;
  label: string;
  files: number;
  size: number;
  stations: { eui: string; name: string | null }[];
}

/** The offline map on the laptop (decision D4). */
export interface MapState {
  present: boolean;
  project_id: string | null;
  project_name: string | null;
  build: string | null;
  size_bytes: number | null;
  downloaded_at: string | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  max_zoom: number | null;
  server_state: string | null;
}

/** An offload station of the bundle with where it stands. */
export interface Station {
  device_id: string;
  name: string;
  station_eui: string;
  lat: number | null;
  lon: number | null;
}

/** What the files brought per offload station (`GET /api/stations`). */
export interface StationStats {
  station_eui: string;
  station_device_id: string | null;
  station_name: string | null;
  cards: number;
  files: number;
  frames: number;
  pending: number;
  failed: number;
  uploaded: number;
  duplicate: number;
  last_read: string | null;
}

/** A device as the bundle knows it, never a key (`GET /api/bundle/devices`). */
export interface BundleDevice {
  id: string;
  name: string;
  serial_number: string | null;
  dev_eui: string | null;
  device_type_label: string | null;
  driver_key: string | null;
  status: string | null;
  firmware_version: string | null;
  entity_id: string | null;
  entity_name: string | null;
  is_station: boolean;
  has_address: boolean;
  has_keys: boolean;
}
