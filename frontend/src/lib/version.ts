/** Versions as the releases name them (`v1.2.3`, with an optional `-beta.1`), compared the way
 * AddaxAI's update check compares them: only a parsed pair gives an answer, so a dev build
 * ("v0.0.0-dev") never nags anybody. */

export interface ParsedVersion {
  parts: [number, number, number];
  pre: string | null;
}

export function parseVersion(text: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/.exec(text.trim());
  if (!match) return null;
  const pre = match[4] ?? null;
  if (pre === "dev") return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre };
}

/** -1 when `a` is older than `b`, 1 when newer, 0 when equal, null when either is no version. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] < right.parts[i] ? -1 : 1;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === null) return 1; // a release is newer than its own pre-release
  if (right.pre === null) return -1;
  return left.pre < right.pre ? -1 : 1;
}
