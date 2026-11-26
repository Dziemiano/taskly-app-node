import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "./workflow.mjs";
const trustedRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const result = await runWorkflow({
  event,
  trustedRoot,
  output: path.resolve(process.env.AGENT_OUTPUT ?? "agent-output"),
});
if (result.unassociated) {
  console.error(
    "PR association failed; see fatal-error.json. No PR publication attempted.",
  );
  process.exitCode = 1;
}
