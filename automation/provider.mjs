import { readFile } from "node:fs/promises";
import { proposalSchema, LIMITS } from "./contracts.mjs";
export async function loadInstructions(trustedRoot, skills) {
  const agent = await readFile(new URL("./agent.md", import.meta.url), "utf8");
  return (
    agent +
    "\n\n" +
    (
      await Promise.all(
        skills.map(
          async (name) =>
            `## Loaded skill: ${name}\n${await readFile(`${trustedRoot}/.agents/skills/${name}/SKILL.md`, "utf8")}`,
        ),
      )
    ).join("\n\n")
  );
}
export async function responsesProvider(
  { instructions, context, feedback, attempt },
  {
    key = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL,
    fetchImpl = fetch,
  } = {},
) {
  if (!key || !model)
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required");
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: JSON.stringify({
        untrustedContext: context,
        untrustedDiagnostics: feedback,
        attempt,
      }),
      tools: [],
      max_output_tokens: 6000,
      text: {
        format: {
          type: "json_schema",
          name: "test_proposal",
          strict: true,
          schema: proposalSchema,
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > LIMITS.proposalBytes * 3)
    throw new Error("Provider response exceeds budget");
  const body = JSON.parse(text);
  if (body.status !== "completed")
    throw new Error("Provider response incomplete");
  const output = body.output?.flatMap((x) => x.content ?? []) ?? [];
  if (output.some((x) => x.type === "refusal"))
    throw new Error("Provider refused generation");
  const chunks = output.filter((x) => x.type === "output_text");
  if (chunks.length !== 1) throw new Error("Provider output missing");
  return JSON.parse(chunks[0].text);
}
