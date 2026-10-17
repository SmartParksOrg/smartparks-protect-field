import { compareVersions, parseVersion } from "@/lib/version";

test("parses release names and refuses dev builds", () => {
  expect(parseVersion("v1.2.3")).toEqual({ parts: [1, 2, 3], pre: null });
  expect(parseVersion("1.2.3-beta.1")?.pre).toBe("beta.1");
  expect(parseVersion("v0.0.0-dev")).toBeNull();
  expect(parseVersion("(dev)")).toBeNull();
});

test("orders versions, with a release above its pre-release", () => {
  expect(compareVersions("v1.2.3", "v1.3.0")).toBe(-1);
  expect(compareVersions("v2.0.0", "v1.9.9")).toBe(1);
  expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
  expect(compareVersions("v1.2.3-beta.1", "v1.2.3")).toBe(-1);
  expect(compareVersions("v0.0.0-dev", "v1.0.0")).toBeNull();
});
