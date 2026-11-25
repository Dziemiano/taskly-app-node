# Architecture review — initial pass

## Goal and ownership
Read external task as requirements, challenge coordinator proposal and revise detailed execution plan. Owned `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, this report. No application implementation changed.

## Findings and discussion
1. Combined credential-bearing generation/test execution is unsafe because npm lifecycle scripts, test config and source execute arbitrary PR code. Coordinator accepted tool-free Responses API generation and Docker-only PR execution without host secrets.
2. `workflow_run` is privileged: controller and publication scripts must come from trusted default branch, not PR. Artifact contents and PR metadata remain untrusted data.
3. A test-only path allowlist does not prevent assertion weakening. Preserve originals, require auditability, test mechanical restrictions and document semantic limitation.
4. Publishing patches rather than pushing directly avoids recursive workflow commits and unwanted writes to contributor branches.
5. Workflow activation on trusted default branch may require merge; without merge authorization, documentation/demo must explain branch activation rather than claim deployed automation.
6. User-approved no-provider-key scope means deterministic provider mock plus real secretless CI, with explicit real-model launch instructions. Do not claim live model success.

## Evidence
Inspected AGENTS.md, all existing role contracts, initial plan, decision log, backend/frontend package manifests, coverage configurations and external assignment. No test run claimed for this documentation-only pass.

## Pending independent review
Implementation review needed after automation exists: Docker mount/environment/network boundaries, trusted workflow refs, SHA binding, artifact parsing, no-op/error states, bounded repair and negative tests.

## Independent frontend/backend review

Inspected new HTTP/mutation/notice tests and backend factory/config/database/lifecycle tests and specialist reports after implementation. Tests exercise observable failure, cancellation, cache and shutdown behavior, use isolated mocks/clients/timers, and preserve production source and coverage settings. No blocking defect found. Evidence marked phases 2/3 complete using specialist-recorded executed checks; architect did not independently rerun those suites because reports already contain complete passing evidence and no concrete additional execution risk was identified.

Minor hygiene observation: lifespan tests restore process.exitCode to undefined rather than its prior value. This does not affect the normal test run and is not an acceptance blocker.

Local Docker socket is unavailable even with escalation (coordinator finding). Real container fixture verification is therefore required through GitHub CI; local mocks do not establish container integration success.

## Independent automation contract probes

Ran an isolated Node script importing the actual `automation/contracts.mjs` into a temporary directory. Exit 0: rejected traversal, production-source edits, symlink-parent writes, replacement of existing tests, no-op carrying files and exclusive tests; accepted a regular new test target. Temporary artifacts were removed. This verifies path/output invariants only; it is not a real model or container run.

## Controller/snapshot/verifier/publication first read

Inspected actual controller, snapshot exporter, Docker verifier and GitHub helpers. Exporter reads individual Git blobs, rejects symlinks/submodules/unsupported paths and bounds snapshot size; it does not extract arbitrary tar archives. Controller captures patch before executing candidate code and records verifier results independently of model text. Docker verifier uses finite process budgets and a finally cleanup that removes the named container, addressing the earlier orphaned-workload concern. Publisher compares current head before updating its marker comment.

Coordinator requested two corrections during integration review: container user should match host UID/GID to avoid root-owned bind-mount outputs; remove temporary candidate `.git` after patch capture and before any container execution. These require confirmation in final review.

Coordinator reports implementation draft PR #1 created. This establishes reviewability, not activation on trusted default branch or successful live CI. No provider key is present; live provider execution remains excluded by user choice.

## Workflow review and requested corrections

Read `ci.yml`, `test-agent.yml`, controller entrypoint, fixture proposal/demo and publication entrypoint. Ordinary CI is secretless and Actions are pinned; privileged controller/publisher check out trusted default branch, source snapshot is exact head identity, provider tools are disabled and publisher checks current head before comment mutation. Docker test network is disabled and source context is bounded. No additional blocking trust-boundary issue found in this pass.

Requested reliability corrections from automation specialist:
- paginate marker-comment discovery instead of reading first 100 comments only, or explicitly bound/fail rather than create duplicates;
- reject `verified` reports without patch metadata;
- confirm host UID/GID container user and removal of temporary candidate `.git` before verification.

Pending evidence: actual Docker fixture in GitHub CI and automation contract suite. `workflow_run` activation still requires trusted default-branch workflow availability.

## Skill validation

Read all three actual skill files and confirmed `loadInstructions` injects their contents into provider instructions. Ran bundled skill-creator `quick_validate.py` independently for analyze-test-changes, backend-unit-tests and frontend-unit-tests: all exit 0, “Skill is valid!”. These checks establish manifest validity and wiring by inspection, not model behavioral quality.

## Correction confirmation and contract-suite execution

Confirmed Docker `--user` matches host UID/GID and controller removes candidate `.git` immediately before verifier call. Confirmed publisher paginates up to ten pages and rejects verified status without patch digest metadata/nonverified status with patch.

Executed root `npm test` after controller/contracts/provider/verifier test files existed: exit 0, all four test files passed. Suite covers routing/output/path invariants, actual trusted skill injection, provider schema/refusal/errors, no-op/baseline failure, patch digest, one repair/two-attempt exhaustion, unsafe proposals, Docker argument isolation and cleanup. This is deterministic contract evidence using mocked provider/verifier where appropriate, not actual Docker success. Additional GitHub/snapshot tests may be added by their owner after this pass; coordinator will record final complete CI evidence.

Reviewed SOLUTION.md draft: correctly distinguishes fixture provider from live generation, measured app coverage, default-branch activation, no automatic merge and container/semantic limits. Exact GitHub CI fixture result remains pending coordinator follow-through.
