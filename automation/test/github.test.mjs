import test from "node:test";
import assert from "node:assert/strict";
import {
  publish,
  triggerIdentity,
  resolveIdentity,
  commentBody,
  github,
} from "../github.mjs";
const head = "a".repeat(40),
  identity = { repository: "owner/repo", pr: 7, head, runId: 100 };
const verification = {
  ok: true,
  integrity: { ok: true, files: 1 },
  steps: [
    { phase: "install", code: 0 },
    { phase: "test", code: 0 },
  ],
  executedTests: [{ path: "frontend/src/a.test.ts", passed: 1 }],
};
const report = {
  version: 1,
  ...identity,
  status: "verified",
  rationale: "Verified behavior",
  skills: ["frontend-unit-tests"],
  attempts: [
    {
      attempt: 1,
      validation: "accepted",
      files: ["frontend/src/a.test.ts"],
      verification,
    },
  ],
  baseline: verification,
  patch: { file: "tests.patch", sha256: "b".repeat(64) },
};

test("trigger identity rejects unrelated workflows and invalid head", () => {
  const event = {
    repository: { full_name: "owner/repo" },
    workflow_run: {
      event: "pull_request",
      path: ".github/workflows/ci.yml",
      repository: { full_name: "owner/repo" },
      pull_requests: [{ number: 7 }],
      head_sha: head,
      id: 100,
    },
  };
  assert.equal(triggerIdentity(event).head, head);
  assert.throws(() =>
    triggerIdentity({
      ...event,
      workflow_run: {
        ...event.workflow_run,
        path: ".github/workflows/other.yml",
      },
    }),
  );
  assert.throws(() =>
    triggerIdentity({
      ...event,
      workflow_run: { ...event.workflow_run, head_sha: "main" },
    }),
  );
});

test("stale or closed PR never causes comment writes", async () => {
  for (const current of [
    { state: "closed", head: { sha: head } },
    { state: "open", head: { sha: "c".repeat(40) } },
  ]) {
    let calls = 0;
    assert.deepEqual(
      await publish(report, identity, {
        api: async () => {
          calls++;
          return current;
        },
      }),
      { status: "stale" },
    );
    assert.equal(calls, 1);
  }
});

test("publisher updates its own marker comment and ignores a user spoof", async () => {
  const writes = [];
  const api = async (route, options) => {
    if (route.includes("/pulls/"))
      return { state: "open", head: { sha: head } };
    if (route.includes("?"))
      return [
        {
          id: 1,
          user: { login: "someone" },
          body: "<!-- taskly-unit-test-agent --> spoof",
        },
        {
          id: 2,
          user: { login: "github-actions[bot]" },
          body: "<!-- taskly-unit-test-agent --> old",
        },
      ];
    writes.push({ route, ...options });
    return {};
  };
  await publish(report, identity, {
    api,
    runUrl: "https://github.com/owner/repo/actions/runs/1",
  });
  await publish(report, identity, {
    api,
    runUrl: "https://github.com/owner/repo/actions/runs/1",
  });
  assert.equal(writes.length, 2);
  assert.ok(
    writes.every(
      (x) => x.method === "PATCH" && x.route.endsWith("/issues/comments/2"),
    ),
  );
});

test("publisher creates a comment when none exists and paginates before writing", async () => {
  const calls = [];
  const api = async (route, options) => {
    calls.push({ route, options });
    if (route.includes("/pulls/"))
      return { state: "open", head: { sha: head } };
    if (route.endsWith("page=1"))
      return Array.from({ length: 100 }, (_, id) => ({
        id,
        user: { login: "reader" },
        body: "hello",
      }));
    if (route.endsWith("page=2")) return [];
    return {};
  };
  assert.deepEqual(
    await publish(report, identity, {
      api,
      runUrl: "https://github.com/owner/repo/actions/runs/1",
    }),
    { status: "published" },
  );
  assert.equal(calls.length, 5);
  assert.equal(calls[4].options.method, "POST");
});

test("mismatched report identity or invalid evidence is rejected before GitHub calls", async () => {
  for (const invalid of [
    { ...report, head: "c".repeat(40) },
    { ...report, pr: 8 },
    { ...report, repository: "other/repo" },
    { ...report, patch: null },
    { ...report, status: "noop" },
    { ...report, attempts: [{ attempt: 3, validation: "accepted" }] },
  ])
    await assert.rejects(() =>
      publish(invalid, identity, {
        api: () => assert.fail("must validate before API"),
      }),
    );
});

test("comment renders bounded rationale without raw HTML, code or direct mentions", () => {
  const body = commentBody(
    { ...report, rationale: "<script>`hello` @team</script>" },
    "https://github.com/owner/repo/actions/runs/1",
  );
  assert.equal(body.includes("<script>"), false);
  assert.equal(body.includes("@team"), false);
  assert.ok(body.includes(head));
  assert.ok(body.includes("verified"));
});

test("GitHub HTTP failure is explicit", async () => {
  await assert.rejects(
    () =>
      github("/repos/owner/repo", {
        token: "fake",
        fetchImpl: async () => new Response("", { status: 403 }),
      }),
    /HTTP 403/,
  );
});

function workflowEvent(pull_requests = []) {
  return {
    repository: { full_name: "owner/repo" },
    workflow_run: {
      event: "pull_request",
      path: ".github/workflows/ci.yml",
      repository: { full_name: "owner/repo" },
      pull_requests,
      head_sha: head,
      id: 100,
    },
  };
}
const associatedPR = {
  number: 7,
  state: "open",
  head: { sha: head },
  base: { repo: { full_name: "owner/repo" } },
};

test("identity uses an existing workflow PR association without fallback API calls", async () => {
  assert.deepEqual(
    await resolveIdentity(workflowEvent([{ number: 7 }]), {
      api: () => assert.fail("fallback should not be needed"),
    }),
    { ...identity, runId: 100 },
  );
});

test("empty workflow PR association resolves exactly one matching open PR at the exact head", async () => {
  const calls = [];
  const result = await resolveIdentity(workflowEvent(), {
    api: async (route) => {
      calls.push(route);
      return [
        { ...associatedPR, number: 8, head: { sha: "c".repeat(40) } },
        {
          ...associatedPR,
          number: 9,
          base: { repo: { full_name: "other/repo" } },
        },
        { ...associatedPR, number: 10, state: "closed" },
        associatedPR,
      ];
    },
  });
  assert.deepEqual(result, { ...identity, runId: 100 });
  assert.deepEqual(calls, [
    `/repos/owner/repo/commits/${head}/pulls?per_page=100`,
  ]);
});

test("identity fallback fails closed for absent, ambiguous or mismatched PR associations", async () => {
  for (const candidates of [
    [],
    [associatedPR, { ...associatedPR, number: 8 }],
    [{ ...associatedPR, head: { sha: "c".repeat(40) } }],
    [{ ...associatedPR, base: { repo: { full_name: "other/repo" } } }],
    [{ ...associatedPR, state: "closed" }],
  ])
    await assert.rejects(
      () =>
        resolveIdentity(workflowEvent(), {
          api: async () => candidates,
        }),
      /missing or ambiguous/,
    );
});

test("identity fallback rejects invalid trigger identity and association budget overflow", async () => {
  const invalid = workflowEvent();
  invalid.workflow_run.head_sha = "main";
  await assert.rejects(
    () =>
      resolveIdentity(invalid, {
        api: () => assert.fail("invalid commit must be rejected before API"),
      }),
    /Invalid commit/,
  );
  for (const candidates of [null, Array(100).fill(associatedPR)]) {
    await assert.rejects(
      () =>
        resolveIdentity(workflowEvent(), {
          api: async () => candidates,
        }),
      /budget/,
    );
  }
});

test("publisher rechecks head after pagination and never writes an obsolete result", async () => {
  let reads = 0,
    writes = 0;
  const api = async (route, options) => {
    if (options) {
      writes++;
      return {};
    }
    if (route.includes("/pulls/"))
      return {
        state: "open",
        head: { sha: ++reads === 1 ? head : "f".repeat(40) },
      };
    return [];
  };
  assert.deepEqual(await publish(report, identity, { api }), {
    status: "stale",
  });
  assert.equal(writes, 0);
});

test("same-head older workflow cannot overwrite a newer bot result", async () => {
  let writes = 0;
  const api = async (route, options) => {
    if (options) {
      writes++;
      return {};
    }
    if (route.includes("/pulls/"))
      return { state: "open", head: { sha: head } };
    return [
      {
        id: 2,
        user: { login: "github-actions[bot]" },
        body: "<!-- taskly-unit-test-agent -->\n<!-- taskly-source-run:101 -->",
      },
    ];
  };
  assert.deepEqual(await publish(report, identity, { api }), {
    status: "stale",
  });
  assert.equal(writes, 0);
});

test("verified publication rejects missing integrity, unexecuted proposals and cross-run artifacts", async () => {
  for (const invalid of [
    { ...report, runId: 101 },
    { ...report, baseline: { ...verification, integrity: { ok: false } } },
    {
      ...report,
      attempts: [
        {
          ...report.attempts[0],
          verification: { ...verification, executedTests: [] },
        },
      ],
    },
    {
      ...report,
      attempts: [
        {
          ...report.attempts[0],
          verification: {
            ...verification,
            steps: [{ phase: "test", code: 0 }],
          },
        },
      ],
    },
  ])
    await assert.rejects(() =>
      publish(invalid, identity, {
        api: () => assert.fail("must reject before write"),
      }),
    );
});

test("GitHub reads retry transient failures once but mutations never retry", async () => {
  let calls = 0;
  const result = await github("/repos/owner/repo", {
    delay: async () => {},
    fetchImpl: async () =>
      ++calls === 1
        ? new Response("", { status: 503 })
        : Response.json({ ok: true }),
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    () =>
      github("/repos/owner/repo", {
        method: "POST",
        body: { body: "x" },
        delay: async () => {},
        fetchImpl: async (_url, options) => {
          calls++;
          assert.equal(options.headers["Content-Type"], "application/json");
          return new Response("", { status: 503 });
        },
      }),
    /HTTP 503/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    () =>
      github("/repos/owner/repo", {
        delay: async () => {},
        fetchImpl: async () => {
          calls++;
          throw new Error("offline");
        },
      }),
    /offline/,
  );
  assert.equal(calls, 2);
});
