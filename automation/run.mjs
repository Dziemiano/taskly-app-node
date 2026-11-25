import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveIdentity, github } from "./github.mjs";
import { safeSha } from "./contracts.mjs";
import { checked } from "./process.mjs";
import { exportSnapshot, contextFor } from "./snapshot.mjs";
import { runAgent } from "./controller.mjs";
import { responsesProvider } from "./provider.mjs";
import { dockerVerify } from "./verifier.mjs";
const trustedRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = path.resolve(process.env.AGENT_OUTPUT ?? "agent-output");
await mkdir(output, { recursive: true });
await rm(path.join(output, "tests.patch"), { force: true });
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const identity = await resolveIdentity(event);
safeSha(identity.head);
const skipped = async (status, rationale) => {
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        version: 1,
        agent: "Taskly Unit Test Agent",
        ...identity,
        status,
        rationale,
        skills: [],
        attempts: [],
        baseline: null,
        patch: null,
      },
      null,
      2,
    ),
  );
};
const pr = await github(`/repos/${identity.repository}/pulls/${identity.pr}`);
if (pr.head.repo?.full_name !== identity.repository) {
  await skipped(
    "skipped_fork",
    "Fork PRs do not receive provider credentials.",
  );
} else if (pr.head.sha !== identity.head || pr.state !== "open") {
  await skipped("noop", "PR changed or closed before execution.");
} else if (event.workflow_run.conclusion !== "success") {
  await skipped(
    "skipped_ci_failure",
    "Ordinary CI did not pass; existing failures require review.",
  );
} else if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  await skipped(
    "skipped_missing_key",
    "Set OPENAI_API_KEY secret and OPENAI_MODEL repository variable to enable live generation.",
  );
} else {
  const temporary = await mkdtemp(path.join(tmpdir(), "taskly-source-"));
  try {
    safeSha(pr.base.sha);
    await checked(
      "git",
      [
        "fetch",
        "--no-tags",
        "--no-recurse-submodules",
        `https://github.com/${identity.repository}.git`,
        identity.head,
        pr.base.sha,
      ],
      { cwd: trustedRoot, timeout: 60_000 },
    );
    const paths = (
      await checked(
        "git",
        ["diff", "--name-only", `${pr.base.sha}...${identity.head}`],
        { cwd: trustedRoot },
      )
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    const snapshot = path.join(temporary, "source");
    await mkdir(snapshot);
    const metadata = await exportSnapshot(trustedRoot, identity.head, snapshot);
    const context = await contextFor(
      trustedRoot,
      pr.base.sha,
      identity.head,
      paths,
      metadata,
    );
    await runAgent({
      snapshot,
      trustedRoot,
      context,
      provider: responsesProvider,
      verify: dockerVerify,
      identity,
      output,
    });
  } catch (error) {
    await skipped("error", error.message);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
