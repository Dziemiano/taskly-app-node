import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { checked } from "../process.mjs";
import { runAgent } from "../controller.mjs";
const trustedRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "taskly-controller-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const snapshot = path.join(root, "snapshot"),
    output = path.join(root, "output");
  await mkdir(path.join(snapshot, "frontend/src"), { recursive: true });
  await mkdir(path.join(snapshot, "backend/tests"), { recursive: true });
  await writeFile(
    path.join(snapshot, "frontend/src/a.ts"),
    "export const a = 1;\n",
  );
  await writeFile(
    path.join(snapshot, "backend/tests/old.test.ts"),
    "test('old',()=>{})\n",
  );
  return {
    snapshot,
    output,
    trustedRoot,
    context: { changedPaths: ["frontend/src/a.ts"] },
    identity: { repository: "owner/repo", pr: 1, head: "a".repeat(40) },
    provider: async () => ({
      decision: "generate",
      rationale: "Cover exported behavior",
      files: [
        { path: "frontend/src/a.test.ts", content: "test('a',()=>{})\n" },
      ],
    }),
    verify: async () => ({ ok: true, steps: [] }),
  };
}

test("nonbehavioral PR skips provider and verifier", async (t) => {
  const args = await fixture(t);
  args.context.changedPaths = ["README.md"];
  args.verify = () => assert.fail("verification not needed");
  args.provider = () => assert.fail("provider not needed");
  assert.equal((await runAgent(args)).status, "noop");
});

test("baseline failure blocks generation and produces no patch", async (t) => {
  const args = await fixture(t);
  args.verify = async () => ({ ok: false, steps: [{ code: 1 }] });
  args.provider = () => assert.fail("provider must not run");
  const result = await runAgent(args);
  assert.equal(result.status, "baseline_failed");
  assert.deepEqual(result.attempts, []);
  await assert.rejects(() => readFile(path.join(args.output, "tests.patch")));
});

test("verified proposal creates applyable test-only patch and matching digest", async (t) => {
  const args = await fixture(t);
  let calls = 0;
  args.verify = async () => {
    calls++;
    return { ok: true, steps: [] };
  };
  const result = await runAgent(args),
    patch = await readFile(path.join(args.output, "tests.patch"), "utf8");
  assert.equal(result.status, "verified");
  assert.equal(calls, 2);
  assert.ok(patch.includes("frontend/src/a.test.ts"));
  await checked(
    "git",
    ["apply", "--check", path.join(args.output, "tests.patch")],
    { cwd: args.snapshot },
  );
  assert.equal(
    result.patch.sha256,
    createHash("sha256").update(patch).digest("hex"),
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(args.output, "result.json"), "utf8")),
    result,
  );
  assert.equal(
    await readFile(path.join(args.snapshot, "frontend/src/a.ts"), "utf8"),
    "export const a = 1;\n",
  );
  await assert.rejects(() =>
    readFile(path.join(args.snapshot, "frontend/src/a.test.ts")),
  );
});

test("one failed verification is fed back for repair and second passing candidate is accepted", async (t) => {
  const args = await fixture(t);
  let calls = 0;
  const received = [];
  const original = args.provider;
  args.verify = async () => ({
    ok: ++calls !== 2,
    steps: [{ code: calls === 2 ? 1 : 0, diagnostics: "expected true" }],
  });
  args.provider = async (input) => {
    received.push(input);
    return original(input);
  };
  const result = await runAgent(args);
  assert.equal(result.status, "verified");
  assert.equal(result.attempts.length, 2);
  assert.equal(received[0].feedback, null);
  assert.equal(received[1].feedback.ok, false);
  assert.deepEqual(received[1].feedback.previousProposal, await original());
  assert.equal(
    received[1].feedback.previousProposal.files[0].content,
    "test('a',()=>{})\n",
  );
  assert.equal(received[1].attempt, 2);
  assert.ok(
    received[0].instructions.includes("Loaded skill: frontend-unit-tests"),
  );
});

test("two failed candidates exhaust budget without publishing patch", async (t) => {
  const args = await fixture(t);
  let calls = 0;
  args.verify = async () => ({ ok: ++calls === 1, steps: [] });
  const result = await runAgent(args);
  assert.equal(result.status, "failed");
  assert.equal(result.attempts.length, 2);
  assert.equal(calls, 3);
  await assert.rejects(() => readFile(path.join(args.output, "tests.patch")));
});

test("unsafe outputs and provider errors are rejected within two attempts", async (t) => {
  const args = await fixture(t);
  let calls = 0;
  args.provider = async () => {
    if (++calls === 1)
      return {
        decision: "generate",
        rationale: "bad",
        files: [{ path: "frontend/src/a.ts", content: "rewritten" }],
      };
    throw new Error("HTTP 429");
  };
  const result = await runAgent(args);
  assert.equal(result.status, "failed");
  assert.equal(calls, 2);
  assert.ok(result.attempts.every((x) => x.validation === "rejected"));
  await assert.rejects(() => readFile(path.join(args.output, "tests.patch")));
});

test("provider noop records decision after passing baseline", async (t) => {
  const args = await fixture(t);
  args.provider = async () => ({
    decision: "noop",
    rationale: "Existing test already asserts changed behavior",
    files: [],
  });
  const result = await runAgent(args);
  assert.equal(result.status, "noop");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.patch, null);
});

test("ignored new tests still produce the proposed patch", async (t) => {
  const args = await fixture(t);
  await writeFile(
    path.join(args.snapshot, "frontend/.gitignore"),
    "*.test.ts\n",
  );
  const result = await runAgent(args);
  assert.equal(result.status, "verified");
  const patch = await readFile(path.join(args.output, "tests.patch"), "utf8");
  assert.ok(patch.includes("frontend/src/a.test.ts"));
  await checked(
    "git",
    ["apply", "--check", path.join(args.output, "tests.patch")],
    { cwd: args.snapshot },
  );
});

test("a reused output directory never publishes an earlier verified patch after noop", async (t) => {
  const args = await fixture(t);
  await mkdir(args.output, { recursive: true });
  await writeFile(path.join(args.output, "tests.patch"), "stale patch");
  args.context.changedPaths = ["README.md"];
  const result = await runAgent(args);
  assert.equal(result.status, "noop");
  assert.equal(result.patch, null);
  await assert.rejects(() => readFile(path.join(args.output, "tests.patch")));
});

test("candidate verification receives exact expected test paths and content hashes", async (t) => {
  const args = await fixture(t);
  const calls = [];
  args.verify = async (root, options) => {
    calls.push({ root, options });
    return { ok: true, steps: [] };
  };
  const result = await runAgent(args);
  assert.equal(result.status, "verified");
  assert.equal(calls[0].options, undefined);
  assert.deepEqual(calls[1].options.expectedTests, [
    {
      path: "frontend/src/a.test.ts",
      sha256: createHash("sha256").update("test('a',()=>{})\n").digest("hex"),
    },
  ]);
});

test("emitted patch preserves proposed bytes despite PR EOL attributes", async (t) => {
  const args = await fixture(t);
  await writeFile(
    path.join(args.snapshot, "frontend/.gitattributes"),
    "*.test.ts text eol=lf ident\n",
  );
  const content =
    "// $Id$\r\nimport { it, expect } from 'vitest'\r\nit('bytes', () => expect(true).toBe(true))\r\n";
  args.provider = async () => ({
    decision: "generate",
    rationale: "preserve bytes",
    files: [{ path: "frontend/src/bytes.test.ts", content }],
  });
  const result = await runAgent(args);
  assert.equal(result.status, "verified");
  await checked("git", ["apply", path.join(args.output, "tests.patch")], {
    cwd: args.snapshot,
  });
  assert.equal(
    await readFile(
      path.join(args.snapshot, "frontend/src/bytes.test.ts"),
      "utf8",
    ),
    content,
  );
});
