import { readFile } from "node:fs/promises";
import { resolveIdentity, publish } from "./github.mjs";
import { readReport } from "./report.mjs";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const identity = await resolveIdentity(event);
const report = await readReport("agent-output");
console.log(
  await publish(report, identity, {
    runUrl: `https://github.com/${identity.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  }),
);
