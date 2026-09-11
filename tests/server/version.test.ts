import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getPackageVersion } from "../../src/server/version.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function expectedVersion(): string {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
    version: string;
  };
  return pkg.version;
}

describe("getPackageVersion", () => {
  it("reads the version from package.json relative to the given base dir", () => {
    expect(getPackageVersion(join(repoRoot, "src", "server"))).toBe(expectedVersion());
  });

  it("defaults to resolving relative to its own module location", () => {
    expect(getPackageVersion()).toBe(expectedVersion());
  });
});
