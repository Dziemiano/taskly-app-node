import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  testPath,
  validateProposal,
  LIMITS,
  actionable,
  routeSkills,
  safeSha,
  safeRepo,
} from "../contracts.mjs";
const proposal = (files, extra = {}) => ({
  decision: "generate",
  rationale: "Cover changed behavior",
  files,
  ...extra,
});
async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), "taskly-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("only canonical frontend/backend test paths pass", () => {
  for (const p of [
    "frontend/src/a.test.ts",
    "frontend/src/hooks/a.test.tsx",
    "backend/tests/a.test.ts",
  ])
    assert.equal(testPath(p), true, p);
  for (const p of [
    "frontend/src/a.ts",
    "backend/src/a.test.ts",
    "/backend/tests/a.test.ts",
    "backend/tests/../a.test.ts",
    "backend//tests/a.test.ts",
    "backend/tests/./a.test.ts",
    "backend/tests/a.test.ts/",
    "backend/tests/a\\b.test.ts",
    "backend/tests/a\n.test.ts",
  ])
    assert.equal(testPath(p), false, p);
  assert.equal(actionable(["README.md", "frontend/src/a.test.ts"]), false);
  assert.equal(actionable(["frontend/src/a.ts"]), true);
  assert.deepEqual(routeSkills(["frontend/src/a.tsx", "backend/src/a.ts"]), [
    "analyze-test-changes",
    "frontend-unit-tests",
    "backend-unit-tests",
  ]);
  assert.throws(() => safeSha("main"));
  assert.throws(() => safeRepo("../../secret"));
  assert.equal(safeSha("a".repeat(40)), "a".repeat(40));
});

test("proposal schema, decision, duplicates and budgets fail closed", async (t) => {
  const root = await temporary(t),
    f = {
      path: "backend/tests/new.test.ts",
      content: "test('works', () => {})\n",
    };
  await validateProposal(proposal([f]), root);
  for (const p of [
    null,
    {},
    proposal([f], { extra: true }),
    proposal([]),
    proposal([f], { decision: "noop" }),
    proposal([f, f]),
    proposal([f], { rationale: "" }),
    proposal([{ ...f, extra: 1 }]),
    proposal([{ ...f, content: "x".repeat(LIMITS.fileBytes + 1) }]),
    proposal([{ ...f, content: "a\0b" }]),
    proposal(
      Array.from({ length: 9 }, (_, i) => ({
        ...f,
        path: `backend/tests/${i}.test.ts`,
      })),
    ),
  ])
    await assert.rejects(() => validateProposal(p, root));
  const oversized = proposal(
    Array.from({ length: 6 }, (_, i) => ({
      path: `backend/tests/${i}.test.ts`,
      content: "x".repeat(30000),
    })),
  );
  await assert.rejects(() => validateProposal(oversized, root), /budget/);
  await validateProposal(
    { decision: "noop", rationale: "No behavioral change", files: [] },
    root,
  );
});

test("existing tests are append-only and focused or skipped tests are rejected", async (t) => {
  const root = await temporary(t),
    p = "backend/tests/old.test.ts",
    before = "test('old', () => {})\n";
  await mkdir(path.join(root, "backend/tests"), { recursive: true });
  await writeFile(path.join(root, p), before);
  await validateProposal(
    proposal([{ path: p, content: before + "test('new', () => {})\n" }]),
    root,
  );
  for (const content of [
    before,
    before.replace("old", "rewritten"),
    before + "test.only('focus',()=>{})",
    before + "it.skip('skip',()=>{})",
    before + "describe.todo('later')",
    before + "test.concurrent.only('focus',()=>{})",
    before + "it.each([1]).skip('later',()=>{})",
  ])
    await assert.rejects(() =>
      validateProposal(proposal([{ path: p, content }]), root),
    );
});

test("symlink files, symlink ancestors and directory targets are rejected", async (t) => {
  const root = await temporary(t),
    outside = await temporary(t);
  await mkdir(path.join(root, "backend"), { recursive: true });
  await symlink(outside, path.join(root, "backend/tests"));
  await assert.rejects(
    () =>
      validateProposal(
        proposal([{ path: "backend/tests/a.test.ts", content: "test()" }]),
        root,
      ),
    /filesystem/,
  );
  await rm(path.join(root, "backend/tests"));
  await mkdir(path.join(root, "backend/tests/a.test.ts"), { recursive: true });
  await assert.rejects(
    () =>
      validateProposal(
        proposal([{ path: "backend/tests/a.test.ts", content: "test()" }]),
        root,
      ),
    /filesystem/,
  );
  await rm(path.join(root, "backend/tests/a.test.ts"), { recursive: true });
  await writeFile(path.join(outside, "a"), "old");
  await symlink(
    path.join(outside, "a"),
    path.join(root, "backend/tests/a.test.ts"),
  );
  await assert.rejects(
    () =>
      validateProposal(
        proposal([{ path: "backend/tests/a.test.ts", content: "test()" }]),
        root,
      ),
    /filesystem/,
  );
});
