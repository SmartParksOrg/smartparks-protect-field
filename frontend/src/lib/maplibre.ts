// MapLibre 6 runs in a module worker. Vite bundles it (with its shared chunk) when imported with
// `?worker&url`; without this the browser fetches a file that is not in the build. Every map
// imports MapLibre through this module so the worker is set, as Protect's maps do.
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
