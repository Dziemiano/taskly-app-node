import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { responsesProvider, loadInstructions } from "../provider.mjs";
const input = {
  instructions: "trusted policy",
  context: { diff: "untrusted diff" },
  feedback: null,
  attempt: 1,
};
const opts = (body) => ({
  key: "test-only",
  model: "test-model",
  fetchImpl: async () => new Response(JSON.stringify(body)),
});
const completed = (content) => ({ status: "completed", output: [{ content }] });

test("provider sends strict schema and treats PR context as data without tools", async () => {
  let request;
  const result = {
    decision: "noop",
    rationale: "Only documentation",
    files: [],
  };
  assert.deepEqual(
    await responsesProvider(input, {
      key: "test-only",
      model: "test-model",
      fetchImpl: async (url, init) => {
        request = { url, ...init };
        return new Response(
          JSON.stringify(
            completed([{ type: "output_text", text: JSON.stringify(result) }]),
          ),
        );
      },
    }),
    result,
  );
  const body = JSON.parse(request.body);
  assert.equal(body.instructions, input.instructions);
  assert.deepEqual(body.tools, []);
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(JSON.parse(body.input).untrustedContext, input.context);
  assert.equal(request.url, "https://api.openai.com/v1/responses");
});

test("provider rejects refusal, incomplete, malformed, ambiguous and HTTP error responses", async () => {
  for (const body of [
    { status: "incomplete" },
    completed([{ type: "refusal", refusal: "No" }]),
    completed([]),
    completed([
      { type: "output_text", text: "{}" },
      { type: "output_text", text: "{}" },
    ]),
    completed([{ type: "output_text", text: "not-json" }]),
  ])
    await assert.rejects(() => responsesProvider(input, opts(body)));
  await assert.rejects(
    () =>
      responsesProvider(input, {
        key: "test-only",
        model: "test-model",
        fetchImpl: async () => new Response("", { status: 429 }),
      }),
    /HTTP 429/,
  );
  await assert.rejects(
    () => responsesProvider(input, { key: "", model: "test-model" }),
    /required/,
  );
});

test("trusted skill files are actually loaded into agent instructions", async () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const instructions = await loadInstructions(root, [
    "analyze-test-changes",
    "frontend-unit-tests",
    "backend-unit-tests",
  ]);
  for (const name of [
    "analyze-test-changes",
    "frontend-unit-tests",
    "backend-unit-tests",
  ])
    assert.ok(instructions.includes(`Loaded skill: ${name}`));
  assert.ok(instructions.length > 1000);
  await assert.rejects(() => loadInstructions(root, ["missing-skill"]));
});

test("provider cancels oversized response streams before reading the full body", async () => {
  let produced = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      produced++;
      controller.enqueue(new Uint8Array(32_000).fill(65));
      if (produced >= 100) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    () =>
      responsesProvider(input, {
        key: "test-only",
        model: "test-model",
        fetchImpl: async () => new Response(body),
      }),
    /exceeds budget/,
  );
  assert.equal(cancelled, true);
  assert.ok(produced < 100);
});

test("provider includes the failed complete proposal and bounded diagnostics for stateless repair", async () => {
  const previousProposal = {
    decision: "generate",
    rationale: "case",
    files: [
      {
        path: "backend/tests/x.test.ts",
        content: "test('case', () => expect(true).toBe(false))",
      },
    ],
  };
  let request;
  await responsesProvider(
    {
      ...input,
      feedback: { ok: false, previousProposal, steps: [{ code: 1 }] },
      attempt: 2,
    },
    {
      key: "test-only",
      model: "test-model",
      fetchImpl: async (_url, init) => {
        request = JSON.parse(init.body);
        return new Response(
          JSON.stringify(
            completed([
              {
                type: "output_text",
                text: JSON.stringify({
                  decision: "noop",
                  rationale: "covered",
                  files: [],
                }),
              },
            ]),
          ),
        );
      },
    },
  );
  assert.deepEqual(
    JSON.parse(request.input).untrustedDiagnostics.previousProposal,
    previousProposal,
  );
});
