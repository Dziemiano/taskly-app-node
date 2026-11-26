import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveIdentity, github } from "./github.mjs";
import { safeSha } from "./contracts.mjs";
import { checked } from "./process.mjs";
import { exportSnapshot, contextFor } from "./snapshot.mjs";
import { runAgent } from "./controller.mjs";
import { responsesProvider } from "./provider.mjs";
import { dockerVerify } from "./verifier.mjs";

export async function prepareSource({ trustedRoot, identity, pr }) {
  const temporary = await mkdtemp(path.join(tmpdir(), "taskly-source-"));
  const cleanup = () => rm(temporary, { recursive: true, force: true });
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
        ["diff", "--name-only", "-z", `${pr.base.sha}...${identity.head}`],
        { cwd: trustedRoot },
      )
    )
      .split("\0")
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
    return { snapshot, context, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

// This exported boundary allows event/failure paths to be exercised without a key or GitHub writes.
export async function runWorkflow({
  event,
  trustedRoot,
  output,
  api = github,
  key = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL,
  prepare = prepareSource,
  provider = responsesProvider,
  verify = dockerVerify,
  agent = runAgent,
}) {
  await mkdir(output, { recursive: true });
  await Promise.all(
    ["tests.patch", "result.json", "fatal-error.json"].map((file) =>
      rm(path.join(output, file), { force: true }),
    ),
  );
  let identity, source;
  const outcome = async (status, rationale) => {
    // A failed agent/cleanup may have written a candidate before throwing.
    await rm(path.join(output, "tests.patch"), { force: true });
    const report = {
      version: 1,
      agent: "Taskly Unit Test Agent",
      ...identity,
      status,
      rationale,
      skills: [],
      attempts: [],
      baseline: null,
      patch: null,
    };
    await writeFile(
      path.join(output, "result.json"),
      JSON.stringify(report, null, 2),
    );
    return report;
  };
  try {
    identity = await resolveIdentity(event, { api });
    const pr = await api(`/repos/${identity.repository}/pulls/${identity.pr}`);
    if (pr.head?.repo?.full_name !== identity.repository)
      return await outcome(
        "skipped_fork",
        "Fork PRs do not receive provider credentials.",
      );
    if (pr.head.sha !== identity.head || pr.state !== "open")
      return await outcome("noop", "PR changed or closed before execution.");
    if (event.workflow_run.conclusion !== "success")
      return await outcome(
        "skipped_ci_failure",
        "Ordinary CI did not pass; existing failures require review.",
      );
    if (!key || !model)
      return await outcome(
        "skipped_missing_key",
        "Set OPENAI_API_KEY secret and OPENAI_MODEL repository variable to enable live generation.",
      );
    source = await prepare({ trustedRoot, identity, pr });
    return await agent({
      snapshot: source.snapshot,
      trustedRoot,
      context: source.context,
      provider: (input) => provider(input, { key, model }),
      verify,
      identity,
      output,
    });
  } catch (error) {
    if (identity) return await outcome("error", error.message);
    const report = {
      status: "error",
      rationale: error.message,
      unassociated: true,
    };
    await writeFile(
      path.join(output, "fatal-error.json"),
      JSON.stringify(report, null, 2),
    );
    return report;
  } finally {
    if (source) await source.cleanup();
  }
}
