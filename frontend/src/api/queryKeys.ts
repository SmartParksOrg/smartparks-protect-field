/** Query keys come from here, never inline arrays (Protect's rule). */
export const queryKeys = {
  health: ["health"] as const,
  setup: ["setup"] as const,
  latestRelease: ["latest-release"] as const,
  map: ["map"] as const,
  projects: ["projects"] as const,
  bundle: ["bundle"] as const,
};
