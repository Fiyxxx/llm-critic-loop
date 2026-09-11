import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads the version straight from package.json at startup instead of a
 * hardcoded literal here, so the two can never drift out of sync. Resolved
 * relative to this file's own location (dist/server/version.js once built)
 * rather than process.cwd(), since the server can be launched from any
 * working directory via `npx`.
 */
export function getPackageVersion(
  baseDir: string = dirname(fileURLToPath(import.meta.url)),
): string {
  const pkgPath = join(baseDir, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  return pkg.version;
}
