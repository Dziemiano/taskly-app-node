# Independent security and verification-integrity audit

Date: 2026-11-26. Scope: all automation modules, workflows, snapshot/data boundaries and generated-result publication. Implementation ownership assigned by coordinator: verifier, subprocess helper, their tests, keyless negative CI probes and this report. No remote mutation performed by this specialist.

## Findings and corrections

### S1 — A successful test command did not prove proposed tests executed

Before this audit the verifier accepted two command exit codes. A generated file excluded by Vitest (including a proposal in an ignored directory) could receive `verified` while no assertion from that file ran. This is a correctness blocker for the test agent.

Correction: the controller supplies each proposed path and exact content SHA-256. The verifier forces JSON reports for both suites and independently validates nonzero all-passed results. Every proposed file must appear exactly once at its `/work/...` identity, have at least one assertion, and contain no skipped/failed assertions. Excluded, empty and skipped proposed suites fail closed. Canonical excluded-path rejection is also implemented by the agent-contract specialist.

### S2 — Dependency setup could change the code being verified

The patch was captured before `npm ci`, but package lifecycle scripts could rewrite source, tests or configuration before execution. Thus the observed commands could exercise a different program or tests than the captured proposal.

Correction: fingerprint regular protected inputs before setup; compare bytes, executable mode, deletions and unexpected protected files after setup and tests. Reject symlinks and enforce file/byte/entry budgets before allocating file contents. Tracked generated Prisma files are rejected; newly generated Prisma client files remain permitted. Tests run with a read-only `/work` root, with write access limited to dependency/cache, coverage and machine-readable report directories.

Writable overlay mount ancestors are checked as regular directories before every container start. This avoids introducing a new boundary flaw where malicious setup replaces `node_modules` with a host `/proc` symlink and a later Docker bind follows that symlink. A regression proves no second container starts in that case.

### S3 — Subprocess text conversion corrupted Git blob bytes

`stdout += chunk` decoded each Buffer independently. Binary bytes and multibyte UTF-8 split across chunks were altered. Exact source export was therefore not guaranteed.

Correction: collect bounded raw chunks, concatenate once, and offer `encoding: null` for byte-preserving Git blob export. Snapshot specialist consumes this mode and restores executable modes. Tests exercise byte values including invalid UTF-8 and a Unicode character split across process output chunks, plus timeout/output-limit/exit-error handling.

### S4 — Diagnostic character limits did not bound report bytes

A 12,000-character tail containing Unicode or JSON-escaped controls could exceed the publisher report-byte limit when several phases were serialized.

Correction: remove terminal/control escapes and clamp each diagnostic by the UTF-8 size of its serialized JSON string. The six baseline/candidate phase tails remain within their intended report budget; a large Unicode/control regression verifies this property.

## Real CI negative probes added

`automation/verifier-audit.mjs`, called after the positive fixture demo, executes two genuine Docker probes:

1. A deliberately failing proposed file is excluded by the real Vitest configuration. Existing suites pass, but the verifier must reject the missing proposed-file execution evidence.
2. A frontend npm postinstall script rewrites the proposed test. Installation exits zero, but protected-input integrity must reject before tests.

Both must fail for their specific expected guard reason; generic Docker/setup failure is not accepted as a successful probe. The CI artifact additionally contains concise `audit-probes.json`. A local contract verifies fixture construction and that an unexpected accepted result makes the audit fail.

## Verification evidence

- Owned process/verifier/helper suite: 13/13 tests pass, exit 0.
- Local actual Vitest invocation with both default/JSON reporters and `--passWithNoTests=false`: passed, emitted the expected report schema with actual file path and assertion evidence.
- Owned files formatted with the repository's existing Prettier; `git diff --check` passes.
- Initial helper-test attempt omitted a `readFile` import; corrected and all 13 tests rerun successfully.
- Local Node child `-e` stdout was suppressed by this environment even with direct spawnSync; subprocess contracts use portable POSIX tools for deterministic binary/chunk/timeout tests instead. This is not claimed as a production Node failure.
- Actual Docker execution remains unavailable locally. The new positive and negative container probes require coordinator's GitHub CI run; no result from that future run is claimed here.

## Remaining trust limits

This closes ordinary exclusion/setup-mutation false positives and materially strengthens evidence. It does not prove arbitrary JavaScript assertions are meaningful. PR-controlled test configuration or dependencies can deliberately forge reporter output or replace the test runner; the project must not claim protection against a fully hostile toolchain. Production hardening would execute a trusted, immutable test toolchain/configuration policy on isolated workers. The existing container model limits credential exposure; it is not a kernel security proof. The provider is still tool-free, test containers receive no provider/GitHub credentials or Docker socket, and publication remains a separate trusted job.

## Independent integration review of coordinator changes

Reviewed `workflow.mjs`, `report.mjs`, `github.mjs`, `run.mjs`, `publish.mjs` and their new contract tests. The extracted workflow now preserves associated API failures as reports, fails unassociated events closed, binds publication to the source run ID, checks the latest head again after pagination, guards older same-head results, retries only GET requests, validates execution/integrity evidence and loads bounded regular report/patch files. These changes retain the original secret and trust boundaries.

One additional P2 reliability issue was reproduced after this review: a fake agent writes `tests.patch` and then throws (representing a possible post-write cleanup failure). `runWorkflow` produced status `error`, but left the patch; `readReport` then rejected it as `Unverified patch artifact`, preventing publication of the associated error. Coordinator was asked to clear the patch in every nonverified workflow outcome and add a regression. Reproduction used only a temporary output directory and fake API/agent; no remote write or actual model request.

The integrated local root suite was rerun after owned changes: 62/62 automation contracts passed (exit 0). The coordinator is responsible for the subsequent regression, final total and real CI evidence. No other integration blocker was found in the reviewed root-owned modules.
