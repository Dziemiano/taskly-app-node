import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checked } from "./process.mjs";
import { LIMITS, safeSha } from "./contracts.mjs";
export async function exportSnapshot(repository, sha, destination) {
  safeSha(sha);
  const entries = (
    await checked(
      "git",
      ["ls-tree", "-r", "-z", sha, "--", "frontend", "backend"],
      { cwd: repository },
    )
  )
    .split("\0")
    .filter(Boolean);
  if (entries.length > LIMITS.snapshotFiles)
    throw new Error("Snapshot file count exceeds budget");
  let bytes = 0;
  for (const entry of entries) {
    const match =
      /^(100644|100755) blob ([a-f0-9]{40})\t((?:frontend|backend)\/[a-zA-Z0-9_./-]+)$/.exec(
        entry,
      );
    if (
      !match ||
      match[3].split("/").some((x) => x === ".." || x === ".") ||
      /(?:^|\/)\.env(?:\.|$)/.test(match[3])
    )
      throw new Error("Snapshot contains unsupported path/mode");
    const content = await checked("git", ["show", match[2]], {
      cwd: repository,
      maxBytes: LIMITS.snapshotBytes,
    });
    bytes += Buffer.byteLength(content);
    if (bytes > LIMITS.snapshotBytes)
      throw new Error("Snapshot exceeds byte budget");
    const file = path.join(destination, match[3]);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return { files: entries.length, bytes };
}
export async function contextFor(repository, base, head, paths, snapshot) {
  safeSha(base);
  safeSha(head);
  if (paths.length > 100) throw new Error("Changed file count exceeds budget");
  const diff = await checked(
    "git",
    [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      `${base}...${head}`,
      "--",
      "frontend",
      "backend",
    ],
    { cwd: repository, maxBytes: LIMITS.contextBytes },
  );
  const listing = await checked(
    "git",
    [
      "ls-tree",
      "-r",
      "--name-only",
      head,
      "--",
      "frontend/src",
      "backend/src",
      "backend/tests",
    ],
    { cwd: repository },
  );
  const candidates = listing
    .trim()
    .split("\n")
    .filter(
      (x) =>
        /\.(ts|tsx)$/.test(x) &&
        !/(?:\.stories\.|\.styles\.|design-system\/)/.test(x),
    );
  // Entire small behavioral tree supplies neighboring tests and imports; fail closed on budget.
  let size = Buffer.byteLength(diff);
  const files = [];
  for (const file of candidates) {
    const content = await checked("git", ["show", `${head}:${file}`], {
      cwd: repository,
      maxBytes: LIMITS.contextBytes,
    });
    size += Buffer.byteLength(content);
    if (size > LIMITS.contextBytes)
      throw new Error("Source context exceeds budget");
    files.push({ path: file, content });
  }
  return { base, head, changedPaths: paths, diff, files, snapshot };
}
