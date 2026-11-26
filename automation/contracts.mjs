import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
export const LIMITS = Object.freeze({
  files: 8,
  fileBytes: 32_000,
  proposalBytes: 160_000,
  contextBytes: 180_000,
  snapshotBytes: 4_000_000,
  snapshotFiles: 500,
  logBytes: 12_000,
});
export const proposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["generate", "noop"] },
    rationale: { type: "string" },
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  required: ["decision", "rationale", "files"],
};
export function testPath(value) {
  return (
    typeof value === "string" &&
    value.length < 240 &&
    !value
      .split("/")
      .some(
        (x) =>
          !x ||
          x === "." ||
          x === ".." ||
          ["node_modules", "dist", ".git"].includes(x),
      ) &&
    !/[\\\x00-\x1f\x7f]/.test(value) &&
    (/^frontend\/src\/[a-zA-Z0-9_./-]+\.test\.tsx?$/.test(value) ||
      /^backend\/tests\/[a-zA-Z0-9_./-]+\.test\.ts$/.test(value))
  );
}
export async function validateProposal(proposal, root) {
  if (
    !proposal ||
    Object.keys(proposal).sort().join() !== "decision,files,rationale" ||
    !["noop", "generate"].includes(proposal.decision) ||
    typeof proposal.rationale !== "string" ||
    !proposal.rationale.trim() ||
    proposal.rationale.length > 4000 ||
    !Array.isArray(proposal.files)
  )
    throw new Error("Invalid proposal schema");
  if (
    Buffer.byteLength(JSON.stringify(proposal)) > LIMITS.proposalBytes ||
    proposal.files.length > LIMITS.files
  )
    throw new Error("Proposal exceeds budget");
  if ((proposal.decision === "noop") !== (proposal.files.length === 0))
    throw new Error("Decision and files disagree");
  const seen = new Set();
  for (const file of proposal.files) {
    if (
      !file ||
      Object.keys(file).sort().join() !== "content,path" ||
      !testPath(file.path) ||
      seen.has(file.path) ||
      [...seen].some(
        (other) =>
          file.path.startsWith(`${other}/`) ||
          other.startsWith(`${file.path}/`),
      ) ||
      typeof file.content !== "string" ||
      !file.content.trim() ||
      /\x00/.test(file.content) ||
      Buffer.byteLength(file.content) > LIMITS.fileBytes
    )
      throw new Error("Unsafe test proposal");
    seen.add(file.path);
    let current = root;
    for (const part of file.path.split("/")) {
      current = path.join(current, part);
      try {
        const st = await lstat(current);
        if (
          st.isSymbolicLink() ||
          (!st.isDirectory() && current !== path.join(root, file.path)) ||
          (current === path.join(root, file.path) && !st.isFile())
        )
          throw new Error("Unsafe filesystem target");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    try {
      const before = await readFile(path.join(root, file.path), "utf8");
      if (
        !file.content.startsWith(before) ||
        file.content.length <= before.length
      )
        throw new Error("Existing tests must be append-only");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (
      /\.\s*(?:skip|todo|only|skipIf|runIf)\s*\(/.test(file.content) ||
      /\b(?:it|test|describe)(?:\s*\.\s*(?:concurrent|sequential|each|fails))*\s*\.\s*(?:skip|todo|only)\b/.test(
        file.content,
      )
    )
      throw new Error("Skipped or exclusive tests prohibited");
  }
  return proposal;
}
export function routeSkills(paths) {
  return [
    "analyze-test-changes",
    ...(paths.some((x) => x.startsWith("frontend/") && /\.(?:ts|tsx)$/.test(x))
      ? ["frontend-unit-tests"]
      : []),
    ...(paths.some((x) => x.startsWith("backend/") && /\.ts$/.test(x))
      ? ["backend-unit-tests"]
      : []),
  ];
}
export function actionable(paths) {
  return paths.some(
    (x) =>
      /^(?:frontend\/src|backend\/src)\/.*\.(ts|tsx)$/.test(x) &&
      !/(?:\.test\.|\.stories\.|\.styles\.|\.types\.|\/types\.ts$)/.test(x),
  );
}
export function safeSha(sha) {
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha))
    throw new Error("Invalid commit identity");
  return sha;
}
export function safeRepo(repo) {
  if (
    typeof repo !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ||
    repo.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("Invalid repository");
  return repo;
}
