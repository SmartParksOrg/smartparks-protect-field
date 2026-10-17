/** Query keys come from here, never inline arrays (Protect's rule). */
export const queryKeys = {
  health: ["health"] as const,
  setup: ["setup"] as const,
  latestRelease: ["latest-release"] as const,
};
