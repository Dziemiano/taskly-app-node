import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runWorkflow } from "../workflow.mjs";
const head = "a".repeat(40);
const event = {
  repository: { full_name: "owner/repo" },
  workflow_run: {
    event: "pull_request",
    path: ".github/workflows/ci.yml",
    repository: { full_name: "owner/repo" },
    pull_requests: [{ number: 7 }],
    head_sha: head,
    id: 100,
    conclusion: "success",
  },
};
const pr = {
  state: "open",
  head: { sha: head, repo: { full_name: "owner/repo" } },
  base: { sha: "b".repeat(40) },
};
async function setup(t) {
  const output = await mkdtemp(path.join(tmpdir(), "taskly-workflow-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  return {
    event,
    output,
    trustedRoot: output,
    api: async () => pr,
    key: "fake",
    model: "fake",
    prepare: () => assert.fail("must not execute PR code"),
  };
}
test("workflow skip branches do not prepare or run source", async (t) => {
  for (const [patch, status] of [
    [{ key: undefined }, "skipped_missing_key"],
    [{ model: undefined }, "skipped_missing_key"],
    [
      {
        api: async () => ({
          ...pr,
          head: { ...pr.head, repo: { full_name: "fork/repo" } },
        }),
      },
      "skipped_fork",
    ],
    [
      {
        api: async () => ({ ...pr, head: { ...pr.head, sha: "c".repeat(40) } }),
      },
      "noop",
    ],
    [
      {
        event: {
          ...event,
          workflow_run: { ...event.workflow_run, conclusion: "failure" },
        },
      },
      "skipped_ci_failure",
    ],
  ]) {
    const args = { ...(await setup(t)), ...patch };
    assert.equal((await runWorkflow(args)).status, status);
    const report = JSON.parse(
      await readFile(path.join(args.output, "result.json"), "utf8"),
    );
    assert.equal(report.head, head);
    assert.equal(report.runId, 100);
  }
});
test("initial GitHub failure persists associated error report and clears previous patch", async (t) => {
  const args = await setup(t);
  await writeFile(path.join(args.output, "tests.patch"), "stale");
  args.api = async () => {
    throw new Error("GitHub HTTP 503");
  };
  assert.equal((await runWorkflow(args)).status, "error");
  assert.equal(
    JSON.parse(await readFile(path.join(args.output, "result.json"), "utf8"))
      .rationale,
    "GitHub HTTP 503",
  );
  await assert.rejects(() => readFile(path.join(args.output, "tests.patch")));
});
test("unassociated workflow fails closed with diagnostic artifact and no misleading result", async (t) => {
  const args = await setup(t);
  args.event = {};
  args.api = () => assert.fail("no API call");
  const result = await runWorkflow(args);
  assert.equal(result.unassociated, true);
  await assert.rejects(() => readFile(path.join(args.output, "result.json")));
  assert.equal(
    JSON.parse(
      await readFile(path.join(args.output, "fatal-error.json"), "utf8"),
    ).unassociated,
    true,
  );
});
test("prepared source is cleaned up after agent failures and error remains publishable", async (t) => {
  const args = await setup(t);
  let cleaned = 0;
  args.prepare = async () => ({
    snapshot: "safe",
    context: {},
    cleanup: async () => {
      cleaned++;
    },
  });
  args.agent = async () => {
    throw new Error("verification unavailable");
  };
  const result = await runWorkflow(args);
  assert.equal(result.status, "error");
  assert.equal(result.pr, 7);
  assert.equal(cleaned, 1);
});
test("successful workflow passes exact identity and explicit provider configuration to agent", async (t) => {
  const args = await setup(t);
  let cleaned = 0;
  args.prepare = async () => ({
    snapshot: "safe",
    context: { changedPaths: ["backend/src/a.ts"] },
    cleanup: async () => {
      cleaned++;
    },
  });
  args.provider = async (_request, options) => {
    assert.deepEqual(options, { key: "fake", model: "fake" });
    return { decision: "noop" };
  };
  args.agent = async (input) => {
    assert.equal(input.identity.head, head);
    assert.equal(input.snapshot, "safe");
    await input.provider({});
    return { status: "noop" };
  };
  assert.equal((await runWorkflow(args)).status, "noop");
  assert.equal(cleaned, 1);
});

test("agent failure after writing a patch still produces a publishable error artifact", async (t) => {
  const args = await setup(t);
  args.prepare = async () => ({
    snapshot: "safe",
    context: {},
    cleanup: async () => {},
  });
  args.agent = async () => {
    await writeFile(
      path.join(args.output, "tests.patch"),
      "partially accepted",
    );
    throw new Error("cleanup failed");
  };
  const result = await runWorkflow(args);
  assert.equal(result.status, "error");
  const { readReport } = await import("../report.mjs");
  assert.equal((await readReport(args.output)).status, "error");
  await assert.rejects(() => readFile(path.join(args.output, "tests.patch")));
});
