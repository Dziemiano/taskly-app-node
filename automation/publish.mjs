import { readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { triggerIdentity, publish } from "./github.mjs";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const identity = triggerIdentity(event);
const file = "agent-output/result.json";
const stat = await lstat(file);
if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100_000)
  throw new Error("Unsafe report artifact");
const report = JSON.parse(await readFile(file, "utf8"));
if (report.patch) {
  const st = await lstat("agent-output/tests.patch");
  if (!st.isFile() || st.isSymbolicLink() || st.size > 200_000)
    throw new Error("Unsafe patch artifact");
  const patch = await readFile("agent-output/tests.patch");
  if (
    report.patch.file !== "tests.patch" ||
    createHash("sha256").update(patch).digest("hex") !== report.patch.sha256 ||
    report.status !== "verified"
  )
    throw new Error("Patch identity mismatch");
}
console.log(
  await publish(report, identity, {
    runUrl: `https://github.com/${identity.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  }),
);
