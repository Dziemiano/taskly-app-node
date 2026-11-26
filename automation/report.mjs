import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

async function regularFile(file, limit) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw new Error("Unsafe report artifact");
  const value = await readFile(file);
  if (value.length > limit) throw new Error("Artifact exceeds budget");
  return value;
}
export async function readReport(directory) {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new Error("Unsafe artifact directory");
  const content = await regularFile(
    path.join(directory, "result.json"),
    100_000,
  );
  const report = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(content),
  );
  if (!report || typeof report !== "object" || Array.isArray(report))
    throw new Error("Invalid report artifact");
  const patchFile = path.join(directory, "tests.patch");
  if (report.patch) {
    const patch = await regularFile(patchFile, 200_000);
    if (
      !patch.length ||
      report.patch.file !== "tests.patch" ||
      createHash("sha256").update(patch).digest("hex") !==
        report.patch.sha256 ||
      report.status !== "verified"
    )
      throw new Error("Patch identity mismatch");
  } else {
    try {
      await lstat(patchFile);
      throw new Error("Unverified patch artifact");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return report;
}
