import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, readFile, opendir, rm } from "node:fs/promises";
import path from "node:path";
import { command } from "./process.mjs";
import { LIMITS, testPath } from "./contracts.mjs";
const IMAGE = "node:22.16.0-bookworm-slim";
export function clipDiagnostics(value, budget = LIMITS.logBytes) {
  const text = String(value)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  let low = 0,
    high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(JSON.stringify(text.slice(-middle))) <= budget)
      low = middle;
    else high = middle - 1;
  }
  let clipped = low ? text.slice(-low) : "";
  while (Buffer.byteLength(JSON.stringify(clipped)) > budget)
    clipped = clipped.slice(1);
  return clipped;
}

const writableDirectories = [
  "frontend/node_modules",
  "backend/node_modules",
  ".agent-results",
];
const ignored = (relative) =>
  writableDirectories.some(
    (p) => relative === p || relative.startsWith(`${p}/`),
  );
const generated = (relative) =>
  relative === "backend/src/generated/prisma" ||
  relative.startsWith("backend/src/generated/prisma/");

// Fingerprint tracked input locations, never following symlinks created by setup.
export async function protectedManifest(root, { allowGenerated = false } = {}) {
  const files = new Map();
  let visited = 0,
    bytes = 0;
  async function walk(relative) {
    if (++visited > LIMITS.snapshotFiles * 4)
      throw new Error("Protected manifest entry budget exceeded");
    if (ignored(relative)) return;
    if (generated(relative)) {
      if (!allowGenerated)
        throw new Error("Snapshot must not include generated Prisma artifacts");
      return;
    }
    const absolute = path.join(root, relative),
      stat = await lstat(absolute);
    if (stat.isSymbolicLink())
      throw new Error(`Unsafe protected symlink: ${relative}`);
    if (stat.isDirectory()) {
      const directory = await opendir(absolute);
      for await (const entry of directory)
        await walk(`${relative}/${entry.name}`);
    } else if (stat.isFile()) {
      bytes += stat.size;
      if (files.size >= LIMITS.snapshotFiles || bytes > LIMITS.snapshotBytes)
        throw new Error("Protected manifest byte/file budget exceeded");
      files.set(
        relative,
        `${stat.mode & 0o777}:${createHash("sha256")
          .update(await readFile(absolute))
          .digest("hex")}`,
      );
    } else throw new Error(`Unsafe protected file: ${relative}`);
  }
  for (const directory of ["frontend", "backend"]) await walk(directory);
  return files;
}
function sameManifest(before, after) {
  return (
    before.size === after.size &&
    [...before].every(([file, hash]) => after.get(file) === hash)
  );
}
export function dockerArguments(root, name, phase) {
  const script =
    phase === "install"
      ? "for d in frontend backend; do cd /work/$d && npm ci --no-audit --no-fund || exit $?; done"
      : "for d in frontend backend; do cd /work/$d && ./node_modules/.bin/vitest run --coverage --coverage.reportsDirectory=/work/.agent-results/coverage-$d --reporter=default --reporter=json --outputFile=/work/.agent-results/$d.json --passWithNoTests=false && ./node_modules/.bin/tsc --noEmit || exit $?; done";
  return [
    "run",
    "--rm",
    "--name",
    name,
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "--init",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=256",
    "--memory=3g",
    "--cpus=2",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=256m",
    ...(phase === "test" ? ["--network=none"] : []),
    "--mount",
    `type=bind,src=${root},dst=/work${phase === "test" ? ",readonly" : ""}`,
    ...(phase === "test"
      ? writableDirectories.flatMap((relative) => [
          "--mount",
          `type=bind,src=${path.join(root, relative)},dst=/work/${relative}`,
        ])
      : []),
    "--workdir=/work",
    "--env",
    "CI=true",
    "--env",
    "HOME=/tmp",
    "--env",
    "DATABASE_URL=postgresql://test:test@localhost:5432/test",
    IMAGE,
    "sh",
    "-c",
    script,
  ];
}
async function assertWritableDirectories(root) {
  for (const relative of writableDirectories) {
    let current = root;
    for (const segment of relative.split("/")) {
      current = path.join(current, segment);
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error(`Unsafe writable mount: ${relative}`);
    }
  }
}
async function readReport(root, directory) {
  const file = path.join(root, ".agent-results", `${directory}.json`),
    stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000)
    throw new Error(`Unsafe ${directory} test report`);
  const report = JSON.parse(await readFile(file, "utf8"));
  if (
    report.success !== true ||
    !Number.isSafeInteger(report.numTotalTests) ||
    report.numTotalTests < 1 ||
    report.numPassedTests !== report.numTotalTests ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    !Array.isArray(report.testResults)
  )
    throw new Error(
      `${directory} test report contains missing, failed or skipped tests`,
    );
  return report;
}
export async function dockerVerify(
  root,
  { runner = command, expectedTests = [] } = {},
) {
  const steps = [];
  let before;
  try {
    before = await protectedManifest(root);
    for (const test of expectedTests) {
      if (!testPath(test.path) || !/^[a-f0-9]{64}$/.test(test.sha256))
        throw new Error("Invalid expected test identity");
      const content = await readFile(path.join(root, test.path));
      if (createHash("sha256").update(content).digest("hex") !== test.sha256)
        throw new Error(`Proposed test identity changed: ${test.path}`);
    }
    await rm(path.join(root, ".agent-results"), {
      recursive: true,
      force: true,
    });
    for (const relative of writableDirectories)
      await mkdir(path.join(root, relative), { recursive: true });
    for (const phase of ["install", "test"]) {
      const name = `taskly-agent-${randomUUID()}`;
      try {
        await assertWritableDirectories(root);
        const value = await runner(
          "docker",
          dockerArguments(root, name, phase),
          {
            timeout: phase === "install" ? 240_000 : 180_000,
            maxBytes: 2_000_000,
            env: { PATH: process.env.PATH, HOME: process.env.HOME },
          },
        );
        steps.push({
          phase,
          code: value.code,
          diagnostics: clipDiagnostics(value.stdout + "\n" + value.stderr),
        });
        if (value.code !== 0) return { ok: false, steps };
        if (
          !sameManifest(
            before,
            await protectedManifest(root, { allowGenerated: true }),
          )
        )
          throw new Error(
            `Protected source/test/config changed during ${phase}`,
          );
      } finally {
        await runner("docker", ["rm", "-f", name], {
          timeout: 10_000,
          maxBytes: 1000,
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
        }).catch(() => {});
      }
    }
    const reports = await Promise.all([
      readReport(root, "frontend"),
      readReport(root, "backend"),
    ]);
    const suites = reports.flatMap((report) => report.testResults),
      executedTests = [];
    for (const expected of expectedTests) {
      const matches = suites.filter(
        (suite) => suite.name === `/work/${expected.path}`,
      );
      if (
        matches.length !== 1 ||
        matches[0].status !== "passed" ||
        !Array.isArray(matches[0].assertionResults) ||
        matches[0].assertionResults.length < 1 ||
        matches[0].assertionResults.some(
          (assertion) => assertion.status !== "passed",
        )
      )
        throw new Error(
          `Proposed test was not fully executed: ${expected.path}`,
        );
      executedTests.push({
        path: expected.path,
        passed: matches[0].assertionResults.length,
      });
    }
    return {
      ok: true,
      steps,
      integrity: { ok: true, files: before.size },
      executedTests,
    };
  } catch (error) {
    return { ok: false, steps, diagnostics: clipDiagnostics(error.message) };
  }
}
