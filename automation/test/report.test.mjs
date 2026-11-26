import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readReport } from "../report.mjs";
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), "taskly-report-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("report loader validates verified patch digest and returns exact report", async (t) => {
  const root = await setup(t),
    patch = "diff --git a/a b/a\n";
  const report = {
    status: "verified",
    patch: {
      file: "tests.patch",
      sha256: createHash("sha256").update(patch).digest("hex"),
    },
  };
  await writeFile(path.join(root, "result.json"), JSON.stringify(report));
  await writeFile(path.join(root, "tests.patch"), patch);
  assert.deepEqual(await readReport(root), report);
  await writeFile(path.join(root, "tests.patch"), patch + "tampered");
  await assert.rejects(() => readReport(root), /identity/);
});
test("report loader rejects symlinks, malformed JSON and oversized artifacts", async (t) => {
  const root = await setup(t),
    file = path.join(root, "result.json"),
    outside = path.join(root, "outside.json");
  await writeFile(outside, "{}");
  await symlink(outside, file);
  await assert.rejects(() => readReport(root), /Unsafe/);
  await rm(file);
  for (const value of ["{", "null", "[]", " ".repeat(100001), '"\uFFFD"']) {
    await writeFile(file, value);
    await assert.rejects(() => readReport(root));
  }
  await writeFile(file, Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]));
  await assert.rejects(() => readReport(root));
});
test("nonverified report must not carry an old patch artifact", async (t) => {
  const root = await setup(t);
  await writeFile(
    path.join(root, "result.json"),
    JSON.stringify({ status: "noop", patch: null }),
  );
  await writeFile(path.join(root, "tests.patch"), "old");
  await assert.rejects(() => readReport(root), /Unverified/);
  await rm(path.join(root, "tests.patch"));
  assert.equal((await readReport(root)).status, "noop");
});
