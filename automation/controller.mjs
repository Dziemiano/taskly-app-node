import { cp, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { checked } from "./process.mjs";
import { validateProposal, actionable, routeSkills } from "./contracts.mjs";
import { loadInstructions } from "./provider.mjs";
export async function runAgent({
  snapshot,
  trustedRoot,
  context,
  provider,
  verify,
  identity,
  output,
}) {
  await mkdir(output, { recursive: true });
  await rm(path.join(output, "tests.patch"), { force: true });
  const skills = routeSkills(context.changedPaths);
  const result = {
    version: 1,
    agent: "Taskly Unit Test Agent",
    ...identity,
    status: "error",
    skills,
    attempts: [],
    baseline: null,
    patch: null,
  };
  const finish = async () => {
    await writeFile(
      path.join(output, "result.json"),
      JSON.stringify(result, null, 2),
    );
    return result;
  };
  if (!actionable(context.changedPaths)) {
    result.status = "noop";
    result.rationale = "No behavioral frontend/backend TypeScript changes.";
    return finish();
  }
  const temporary = await mkdtemp(path.join(tmpdir(), "taskly-agent-"));
  try {
    const baseline = path.join(temporary, "baseline");
    await cp(snapshot, baseline, { recursive: true });
    result.baseline = await verify(baseline);
    if (!result.baseline.ok) {
      result.status = "baseline_failed";
      result.rationale =
        "Existing head tests/typecheck or setup failed; no generated patch accepted.";
      return await finish();
    }
    const instructions = await loadInstructions(trustedRoot, skills);
    let feedback = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let proposal;
      try {
        proposal = await provider({ instructions, context, feedback, attempt });
        await validateProposal(proposal, snapshot);
      } catch (error) {
        result.attempts.push({
          attempt,
          validation: "rejected",
          diagnostics: error.message,
        });
        feedback = { validation: error.message };
        continue;
      }
      result.rationale = proposal.rationale;
      if (proposal.decision === "noop") {
        result.status = "noop";
        result.attempts.push({
          attempt,
          validation: "accepted",
          decision: "noop",
        });
        return await finish();
      }
      const candidate = path.join(temporary, `candidate-${attempt}`);
      await cp(snapshot, candidate, { recursive: true });
      await checked("git", ["init", "--quiet"], { cwd: candidate });
      // Highest-precedence trusted attributes keep PR attributes and host EOL/clean
      // conversion from altering blobs or invoking a configured external filter.
      await mkdir(path.join(candidate, ".git/info"), { recursive: true });
      await writeFile(
        path.join(candidate, ".git/info/attributes"),
        "* -text -filter -ident -working-tree-encoding\n",
      );
      await checked("git", ["add", "--force", "--", "frontend", "backend"], {
        cwd: candidate,
      });
      for (const file of proposal.files) {
        const target = path.join(candidate, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
      // Build patch before running any untrusted code. Verification cannot rewrite the proposed patch.
      await checked(
        "git",
        [
          "add",
          "--intent-to-add",
          "--force",
          "--",
          ...proposal.files.map((file) => file.path),
        ],
        {
          cwd: candidate,
        },
      );
      const patch = await checked(
        "git",
        [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--binary",
          "--src-prefix=a/",
          "--dst-prefix=b/",
        ],
        { cwd: candidate, maxBytes: 200_000 },
      );
      await rm(path.join(candidate, ".git"), { recursive: true, force: true });
      if (!patch.trim()) throw new Error("Proposal produced an empty patch");
      const expectedTests = proposal.files.map((file) => ({
        path: file.path,
        sha256: createHash("sha256").update(file.content).digest("hex"),
      }));
      const verification = await verify(candidate, { expectedTests });
      result.attempts.push({
        attempt,
        validation: "accepted",
        files: proposal.files.map((x) => x.path),
        verification,
      });
      if (verification.ok) {
        result.status = "verified";
        result.patch = {
          file: "tests.patch",
          sha256: createHash("sha256").update(patch).digest("hex"),
        };
        await writeFile(path.join(output, "tests.patch"), patch);
        return await finish();
      }
      feedback = {
        ...verification,
        previousProposal: proposal,
      };
    }
    result.status = "failed";
    result.rationale ??= "Generation exhausted the two-attempt budget.";
    return await finish();
  } catch (error) {
    result.status = "error";
    result.rationale = error.message;
    return await finish();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
