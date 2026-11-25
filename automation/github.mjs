import { safeRepo, safeSha } from "./contracts.mjs";
export async function github(
  route,
  {
    token = process.env.GITHUB_TOKEN,
    method = "GET",
    body,
    fetchImpl = fetch,
  } = {},
) {
  const response = await fetchImpl(`https://api.github.com${route}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json();
}
export function triggerIdentity(event) {
  const run = event.workflow_run;
  if (
    !run ||
    run.event !== "pull_request" ||
    run.path !== ".github/workflows/ci.yml" ||
    run.repository?.full_name !== event.repository?.full_name
  )
    throw new Error("Unsupported workflow trigger");
  const pr = run.pull_requests?.[0];
  if (!pr || !Number.isSafeInteger(pr.number) || pr.number < 1)
    throw new Error("No associated PR");
  return {
    repository: safeRepo(event.repository.full_name),
    pr: pr.number,
    head: safeSha(run.head_sha),
    runId: run.id,
  };
}

export async function resolveIdentity(event, { api = github } = {}) {
  if (event.workflow_run?.pull_requests?.length) return triggerIdentity(event);
  const run = event.workflow_run;
  if (
    !run ||
    run.event !== "pull_request" ||
    run.path !== ".github/workflows/ci.yml" ||
    run.repository?.full_name !== event.repository?.full_name
  ) {
    throw new Error("Unsupported workflow trigger");
  }
  const repository = safeRepo(event.repository.full_name);
  const head = safeSha(run.head_sha);
  const candidates = await api(
    `/repos/${repository}/commits/${head}/pulls?per_page=100`,
  );
  if (!Array.isArray(candidates) || candidates.length >= 100)
    throw new Error("PR association budget exceeded");
  const matching = candidates.filter(
    (pr) =>
      pr.state === "open" &&
      pr.head?.sha === head &&
      pr.base?.repo?.full_name === repository,
  );
  if (matching.length !== 1)
    throw new Error("PR association missing or ambiguous");
  return triggerIdentity({
    ...event,
    workflow_run: { ...run, pull_requests: [{ number: matching[0].number }] },
  });
}

export function escapeText(text) {
  return String(text ?? "")
    .replace(/[<>`\[\]()]/g, "")
    .replace(/@/g, "@\u200b")
    .slice(0, 4000);
}
export function commentBody(report, runUrl) {
  return `<!-- taskly-unit-test-agent -->\n## Taskly Unit Test Agent\n\nCommit: \`${report.head}\`\n\nStatus: **${report.status}**\n\n${escapeText(report.rationale)}\n\nSkills loaded: ${report.skills.map(escapeText).join(", ") || "none"}\n\nGeneration attempts: ${report.attempts.length}. Baseline: ${report.baseline ? (report.baseline.ok ? "passed" : "failed") : "not run"}.\n\n${report.attempts.map((x) => `Attempt ${x.attempt}: ${x.validation}; verification ${x.verification ? (x.verification.ok ? "passed" : "failed") : "not run"}`).join("\n\n")}\n\n${report.patch ? "Verified test patch is in the agent-results artifact. Review before applying with git apply tests.patch." : "No verified patch published."}\n\n[Workflow and artifacts](${runUrl})\n`;
}
export async function publish(report, identity, { api = github, runUrl } = {}) {
  if (
    report.version !== 1 ||
    report.repository !== identity.repository ||
    report.pr !== identity.pr ||
    report.head !== identity.head ||
    ![
      "skipped_missing_key",
      "skipped_fork",
      "skipped_ci_failure",
      "noop",
      "baseline_failed",
      "verified",
      "failed",
      "error",
    ].includes(report.status) ||
    !Array.isArray(report.skills) ||
    !Array.isArray(report.attempts) ||
    report.attempts.length > 2
  )
    throw new Error("Invalid report identity/schema");
  if (
    !Number.isSafeInteger(report.pr) ||
    report.pr < 1 ||
    report.skills.some((x) => typeof x !== "string" || x.length > 100) ||
    report.attempts.some(
      (x, i) =>
        !x ||
        x.attempt !== i + 1 ||
        !["accepted", "rejected"].includes(x.validation),
    ) ||
    (report.status === "verified" &&
      (!report.patch ||
        report.patch.file !== "tests.patch" ||
        !/^([a-f0-9]{64})$/.test(report.patch.sha256))) ||
    (report.status !== "verified" && report.patch)
  )
    throw new Error("Invalid report evidence");
  if (
    report.status === "verified" &&
    (report.baseline?.ok !== true ||
      report.attempts.length === 0 ||
      report.attempts.at(-1)?.verification?.ok !== true)
  ) {
    throw new Error("Verified report lacks successful verifier evidence");
  }
  safeSha(report.head);
  safeRepo(report.repository);
  const current = await api(
    `/repos/${identity.repository}/pulls/${identity.pr}`,
  );
  if (current.state !== "open" || current.head.sha !== report.head)
    return { status: "stale" };
  let previous;
  for (let page = 1; page <= 10; page++) {
    const comments = await api(
      `/repos/${identity.repository}/issues/${identity.pr}/comments?per_page=100&page=${page}`,
    );
    previous = comments.find(
      (x) =>
        x.user?.login === "github-actions[bot]" &&
        x.body?.startsWith("<!-- taskly-unit-test-agent -->"),
    );
    if (previous || comments.length < 100) break;
    if (page === 10) throw new Error("Comment pagination budget exceeded");
  }
  const body = commentBody(report, runUrl);
  if (previous)
    await api(`/repos/${identity.repository}/issues/comments/${previous.id}`, {
      method: "PATCH",
      body: { body },
    });
  else
    await api(`/repos/${identity.repository}/issues/${identity.pr}/comments`, {
      method: "POST",
      body: { body },
    });
  return { status: "published" };
}
