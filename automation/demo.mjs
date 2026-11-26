import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checked, command } from "./process.mjs";
import { exportSnapshot } from "./snapshot.mjs";
import { runAgent } from "./controller.mjs";
import { dockerVerify } from "./verifier.mjs";
import { runVerifierAudit } from "./verifier-audit.mjs";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(path.join(tmpdir(), "taskly-demo-"));
try {
  const head = (
    await checked("git", ["rev-parse", "HEAD"], { cwd: root })
  ).trim();
  const snapshot = path.join(temporary, "source");
  await mkdir(snapshot);
  await exportSnapshot(root, head, snapshot);
  const feature = path.join(root, "automation/fixtures/overdue-feature.patch");
  const applicable = await command("git", ["apply", "--check", feature], {
    cwd: snapshot,
  });
  if (applicable.code === 0)
    await checked("git", ["apply", feature], { cwd: snapshot });
  else
    await checked("git", ["apply", "--reverse", "--check", feature], {
      cwd: snapshot,
    });
  const proposal = JSON.parse(
    await readFile(
      path.join(root, "automation/fixtures/overdue-proposal.json"),
      "utf8",
    ),
  );
  const context = {
    changedPaths: [
      "frontend/src/features/todos/types.ts",
      "frontend/src/features/todos/utils/todos.ts",
      "frontend/src/features/todos/components/TodoFilters.tsx",
    ],
    note: "Deterministic fixture provider; no live model request.",
  };
  const result = await runAgent({
    snapshot,
    trustedRoot: root,
    context,
    identity: {
      repository: "Dziemiano/taskly-app-node",
      pr: 0,
      head,
      provider: "fixture",
    },
    output: path.join(root, "agent-demo-output"),
    verify: dockerVerify,
    provider: async ({ attempt }) =>
      attempt === 1
        ? {
            ...proposal,
            files: proposal.files.map((x, i) =>
              i === 0
                ? {
                    ...x,
                    content:
                      x.content +
                      "\nimport { it as brokenCase, expect as check } from 'vitest'\nbrokenCase('fixture first-attempt failure', () => check(true).toBe(false))\n",
                  }
                : x,
            ),
          }
        : proposal,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "verified" || result.attempts.length !== 2) {
    process.exitCode = 1;
  } else {
    const audit = await runVerifierAudit({
      snapshot,
      output: path.join(root, "agent-demo-output"),
    });
    console.log(JSON.stringify(audit, null, 2));
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
