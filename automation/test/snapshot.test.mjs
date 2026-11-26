import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  chmod,
  stat,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { checked } from "../process.mjs";
import { exportSnapshot, contextFor } from "../snapshot.mjs";
async function repository(t) {
  const root = await mkdtemp(path.join(tmpdir(), "taskly-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "repo/frontend/src"), { recursive: true });
  await mkdir(path.join(root, "repo/backend/tests"), { recursive: true });
  const repo = path.join(root, "repo");
  await checked("git", ["init", "--quiet"], { cwd: repo });
  await writeFile(
    path.join(repo, "frontend/src/a.ts"),
    "export const a = 1;\n",
  );
  await writeFile(
    path.join(repo, "backend/tests/a.test.ts"),
    "test('a',()=>{})\n",
  );
  await writeFile(path.join(repo, "policy.txt"), "not application code");
  const commit = async () => {
    await checked("git", ["add", "--all"], { cwd: repo });
    await checked(
      "git",
      [
        "-c",
        "user.name=Contract Tests",
        "-c",
        "user.email=tests@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: repo },
    );
    return (await checked("git", ["rev-parse", "HEAD"], { cwd: repo })).trim();
  };
  return { repo, root, commit };
}

test("snapshot exports tracked application files at exact commit and omits unrelated policy", async (t) => {
  const { repo, root, commit } = await repository(t),
    sha = await commit(),
    out = path.join(root, "out");
  await writeFile(path.join(repo, "frontend/src/a.ts"), "uncommitted");
  const summary = await exportSnapshot(repo, sha, out);
  assert.equal(summary.files, 2);
  assert.equal(
    await readFile(path.join(out, "frontend/src/a.ts"), "utf8"),
    "export const a = 1;\n",
  );
  await assert.rejects(() => readFile(path.join(out, "policy.txt")));
});

test("snapshot rejects symlink mode and environment files", async (t) => {
  for (const kind of ["symlink", "env"]) {
    const { repo, root, commit } = await repository(t);
    if (kind === "symlink")
      await symlink("a.ts", path.join(repo, "frontend/src/link.ts"));
    else await writeFile(path.join(repo, "backend/.env"), "FAKE=not-secret");
    const sha = await commit();
    await assert.rejects(
      () => exportSnapshot(repo, sha, path.join(root, "out")),
      /unsupported path\/mode/,
    );
  }
});

test("context binds exact base/head diff and neighboring source/test contents", async (t) => {
  const { repo, root, commit } = await repository(t),
    base = await commit();
  await writeFile(
    path.join(repo, "frontend/src/a.ts"),
    "export const a = 2;\n",
  );
  const head = await commit();
  const context = await contextFor(
    repo,
    base,
    head,
    ["frontend/src/a.ts"],
    path.join(root, "snapshot"),
  );
  assert.equal(context.base, base);
  assert.equal(context.head, head);
  assert.match(context.diff, /export const a = 2/);
  assert.ok(context.files.some((x) => x.path === "backend/tests/a.test.ts"));
  await assert.rejects(
    () => contextFor(repo, base, head, Array(101).fill("a"), root),
    /count/,
  );
});

test("snapshot preserves binary bytes and tracked executable mode exactly", async (t) => {
  const { repo, root, commit } = await repository(t);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00, 0x80]);
  await writeFile(path.join(repo, "frontend/image.png"), bytes);
  await writeFile(path.join(repo, "backend/script.sh"), "#!/bin/sh\nexit 0\n");
  await chmod(path.join(repo, "backend/script.sh"), 0o755);
  const head = await commit();
  const out = path.join(root, "out");
  await exportSnapshot(repo, head, out);
  assert.deepEqual(await readFile(path.join(out, "frontend/image.png")), bytes);
  assert.equal(
    (await stat(path.join(out, "backend/script.sh"))).mode & 0o777,
    0o755,
  );
  assert.equal(
    (await stat(path.join(out, "frontend/image.png"))).mode & 0o777,
    0o644,
  );
});
