# Implementation and verification plan

Date: 2026-11-25. Baseline: `22be6e3bcf54fd012104fe233ef6652dd01941ff`.
This document is an execution ledger. A checkbox means the stated artifact and evidence exist, not that a model merely proposed them. The external assignment remains outside the repository.

## Current delivery status — implementation and real CI verified

Local application tests/typechecks/coverage and 33 automation contract cases pass. All workflow YAML passes actionlint; Git diff checks pass. Both implementation and demo branches are published after user refreshed GitHub workflow authorization. [Implementation PR #1](https://github.com/Dziemiano/taskly-app-node/pull/1) and [demo PR #2](https://github.com/Dziemiano/taskly-app-node/pull/2) are reviewable.

Real GitHub CI passed all three jobs in [implementation run 45692900997](https://github.com/Dziemiano/taskly-app-node/actions/runs/45692900997); [demo run 45692977519](https://github.com/Dziemiano/taskly-app-node/actions/runs/45692977519) also passed. Real Docker fixture evidence: baseline passed; attempt 1 installation succeeded and tests failed intentionally; attempt 2 installation and tests passed. Result is `verified` with provider `fixture`, never a live model claim. Artifact [15060230453](https://github.com/Dziemiano/taskly-app-node/actions/runs/45692900997/artifacts/15060230453) contains the patch and run results.

Automatic privileged PR-comment publication still requires the `workflow_run` workflow on the default branch; no merge is authorized. Live model execution remains excluded by the user's no-key choice. Local Docker remains unavailable, but actual container integration is established by successful GitHub CI.

## Ownership and execution protocol

| Owner | Exclusive implementation area | Review responsibility |
| --- | --- | --- |
| Coordinator | integration, publication, shared agreements | acceptance, honest evidence, task completion |
| Architect | this plan, decisions log, architecture review | trust boundaries, failure modes, plan revision |
| Frontend specialist | `frontend/**`, frontend report | observable React and HTTP behavior |
| Backend specialist | `backend/**`, backend report | app composition, lifecycle and HTTP behavior |
| Automation specialist | `automation/**`, `.github/**`, reusable skills, root tooling | custom agent, validation, CI and contract tests |
| Documentation specialist | `SOLUTION.md`, final evidence narrative | runnable setup, real results and limitations |

Agents discuss design and cross-area changes with the coordinator before implementation. They own their paths only. The coordinator may assign the next specialist after a slot is released. Each report includes commands, exit statuses, measured results, failures, corrections and unresolved prerequisites. All checks use bounded execution. No specialist publishes remotely.

## Agreed acceptance target

- Missing useful tests added in frontend and backend, with measured coverage change.
- A named custom test agent and reusable skills are defined in versioned files and actually used in execution.
- GitHub automatically responds to relevant PR changes, selects whether tests are useful, generates/updates appropriate unit tests and runs verification.
- Results are visible on the specific PR: commit identity, decision/rationale, skills used, test results and downloadable patch when valid.
- Forks, missing credentials, existing failures, malformed model output, stale PR heads and retries have explicit outcomes.
- Security controls are enforced by code/workflow, not solely model instructions.
- `SOLUTION.md` explains decisions, prerequisites, commands, real example evidence, assumptions, limits and production extensions.
- A feature PR and deterministic mocked-provider demonstration show the workflow; current user-approved scope excludes live provider execution without a key. A local simulation is labelled as such.

## Phase 0 — Bootstrap and agreements

- [x] 0.1 Coordinator: inspect workspace, Git state, remote repository and external task. Evidence: initial workspace was empty; remote main identified above.
- [x] 0.2 Coordinator: clone application into `taskly-app-node` because outer `.git` is read-only and empty. Preserve upstream history.
- [x] 0.3 Coordinator: write `AGENTS.md` and `docs/agents/{coordinator,architect,frontend,backend,automation}.md` with scope, ownership and evidence rules.
- [x] 0.4 Coordinator: delegate independent architecture review before automation interfaces are fixed.
- [x] 0.5 Coordinator: record tool versions and dependency installation status; check whether provider credentials and GitHub permissions are available without printing values.
- [x] 0.6 Coordinator: record external prerequisites as actionable blocked items if absent; continue local implementation regardless.

Exit: each active specialist acknowledges its role and ownership; no assignment text or credentials enter tracked files.

## Phase 1 — Architecture challenge and contracts

Dependencies: phase 0. Owner: architect; approval: coordinator.

- [x] 1.1 Read application manifests, existing test conventions, coverage configuration and assignment requirements.
- [x] 1.2 Challenge initial one-job Codex/test proposal: holding provider/write credentials while executing PR-controlled code creates a concrete trust violation.
- [x] 1.3 Recommend separated generation, verification and publication; discuss runtime choice with coordinator.
- [x] 1.4 Coordinator accepted direct Responses API without tools. Trusted controller loads explicit skills and requests JSON file proposals. `OPENAI_MODEL` is configurable; no model may execute shell tools.
- [x] 1.5 Fix machine-readable agent contract: decision, rationale, relevant changed files, skills selected, generated test files, attempt number and diagnostics. Validate schema outside model.
- [x] 1.6 Fix verification contract: exact head SHA, baseline and candidate commands/results, attempt identity, accepted file list and patch digest. Never accept model-reported test success as verifier evidence.
- [x] 1.7 Fix publication contract: exact repository/PR/head SHA, safe status summary, patch only if independently valid, stable comment marker.
- [x] 1.8 Specify bounded input: changed-file count, diff/source bytes, test-file count/bytes and unsupported file handling. Oversized/unknown changes must report limits rather than silently truncate into success.
- [x] 1.9 Specify retry budget: at most two generation attempts and one repair, finite model/network/test timeout, no unbounded feedback loop. Cap generated output and expose model choice via explicit configuration.
- [x] 1.10 Record design choice and rejected alternatives in `docs/DECISIONS.md`.

Exit: automation specialist and coordinator agree on paths, data contracts, trust boundaries and failure statuses before implementation.

## Phase 2 — Frontend behavioral coverage

Dependencies: dependency installation only; can run alongside phases 1 and 3. Owner: frontend specialist.

- [x] 2.1 Run clean baseline `npm test`, `npm run typecheck`, `npm run test:coverage` from `frontend`.
- [x] 2.2 Record test counts and total statement/branch/function/line coverage in `docs/reports/frontend.md`.
- [x] 2.3 Inspect uncovered behavior; prioritize HTTP response failures and mutation cache updates over trivial render snapshots.
- [x] 2.4 Propose selected gaps to coordinator and explain observable contracts.
- [x] 2.5 Add deterministic tests for selected HTTP success/error/body behavior with mocked transport.
- [x] 2.6 Add selected hooks/filter/cache behavior tests with isolated QueryClient and restored mocks; cover failure and empty-state behavior where relevant.
- [x] 2.7 Control timers and asynchronous state; remove network dependence and global state leakage.
- [x] 2.8 Run complete frontend tests, typecheck and coverage. Fix test or implementation causes without weakening expectations or excluding more source.
- [x] 2.9 Record before/after coverage and any remaining untested areas; coordinator reviews changed files.

Evidence: frontend report records baseline 18 tests → final 37 tests; statements 46.42% → 69.04%, lines 47.68% → 67.54%. Full test suite and typecheck pass. Independent architect inspected all changed frontend tests; no blocking finding. Production/configuration unchanged. See `docs/reports/frontend.md`.

Exit: passing checks and meaningful measured coverage increase; source behavior preserved.

## Phase 3 — Backend behavioral coverage

Dependencies: dependency installation only; can run alongside phases 1 and 2. Owner: backend specialist.

- [x] 3.1 Run baseline tests, typecheck and coverage from `backend`; Prisma client generation may require dummy test connection configuration but no real database for unit tests.
- [x] 3.2 Record test counts and coverage in `docs/reports/backend.md`.
- [x] 3.3 Inspect app factory, configuration, database/lifecycle and existing route coverage; propose meaningful missing branches.
- [x] 3.4 Add tests for app composition and error/validation contracts where missing.
- [x] 3.5 Add selected configuration/lifecycle tests using controlled environment, spies and reversible process/signal hooks.
- [x] 3.6 Ensure tests never exit the runner, open persistent listeners or require PostgreSQL; distinguish Supertest component tests in report.
- [x] 3.7 Run complete backend suite, typecheck and coverage; fix causes and restore global state.
- [x] 3.8 Record before/after coverage, review test quality with coordinator and document remaining areas.

Evidence: backend report records 48 → 86 tests; statements 30.23% → 96.89%, lines 33.02% → 97.24%. Full coverage suite and typecheck pass; local Supertest required socket permission escalation. Independent architect inspected all added tests; no blocking finding. Production/configuration unchanged. See `docs/reports/backend.md`.

Exit: passing checks and measured coverage improvement without real database dependency.

## Phase 4 — Agent definition and reusable skills

Dependencies: agreed phase 1 contracts. Owner: automation specialist.

- [x] 4.1 Define named custom test agent with role, permitted outputs, decision criteria and a clear system policy.
- [x] 4.2 Create focused reusable skills: change analysis; frontend test conventions; backend test conventions; verification/reporting if justified.
- [x] 4.3 Each skill includes valid `name`/`description` metadata and only project-specific guidance that changes decisions.
- [x] 4.4 Agent loads change analysis plus relevant frontend/backend skill contents, records selected skill names and does not merely claim use in its final text.
- [x] 4.5 Support frontend-only, backend-only and mixed diffs; documentation-only changes produce explicit no-op.
- [x] 4.6 Separate instructions from PR source/diff data. PR-contained instructions must not override trusted agent policy.
- [x] 4.7 Add baseline existing tests and source context so generation targets public behavior and known conventions.
- [x] 4.8 Emit structured decisions and test proposals, validate response before writing anything.
- [x] 4.9 Validate skill metadata and run focused contract tests for routing and no-op behavior.

Exit: local deterministic demonstration proves skills are loaded and decisions routed, with provider mock explicitly identified.

## Phase 5 — Deterministic validation and bounded repair

Dependencies: phases 1 and 4. Owner: automation specialist.

- [x] 5.1 Implement strict test-path allowlist: frontend test files under its source/test conventions; backend tests under its test directory.
- [x] 5.2 Reject absolute paths, traversal, duplicate/conflicting paths, control characters, symlink parents, non-regular targets, binary payloads and oversized output.
- [x] 5.3 Reject source/config/workflow/lockfile changes and deletion requests from generated proposals.
- [x] 5.4 Make existing-test changes auditable; preserve originals and detect prohibited assertion weakening/deletion where mechanically enforceable, document semantic limits.
- [x] 5.5 Generate patch deterministically against exact PR head; no working-tree contamination across attempts.
- [x] 5.6 Establish baseline test results before candidate tests. Existing failures produce distinct failure status and must not be disguised as generator regressions.
- [x] 5.7 Real credential-free Docker fixture baseline, candidate verification, typecheck and bounded repair passed in GitHub runs 45692900997 and 45692977519. Local Docker remains inaccessible; CI supplies actual integration evidence.
- [x] 5.8 On first candidate failure, return bounded diagnostics to agent and allow one repair; rerun verification from clean head with revised proposal.
- [x] 5.9 After final failure, expose failure evidence and withhold a patch labelled verified. Never loosen assertions to satisfy a failing implementation.
- [x] 5.10 Add negative tests for malformed output, unsafe paths, symlinks, source edits, no-op-with-patch, timeout, existing failures and exhausted repair budget.
- [x] 5.11 Verify test results and patch metadata are produced by controller/verifier, independent of model claims.

Exit: valid proposal passes real tests; dangerous/invalid proposals fail closed; repair is bounded and tested.

## Phase 6 — GitHub workflow and publication

Dependencies: validated contracts. Owner: automation specialist; remote operations: coordinator.

- [x] 6.1 Add ordinary CI for frontend, backend and automation tests with read-only checkout credentials and finite job timeouts.
- [x] 6.2 Secretless `pull_request` CI triggers on open, synchronize and reopen. Trusted `workflow_run` controller consumes completed CI identity; offer manual re-run where practical.
- [x] 6.3 Ensure trusted workflow/policy/scripts originate from trusted base ref. Never execute PR scripts in a secret-bearing privileged job.
- [x] 6.4 Automatic generation scope is trusted same-repository PRs; fork PRs have explicit supported/skip behavior and no provider secret exposure.
- [x] 6.5 Controller exports exact PR SHA as data, excluding `.git` and agent policies. Dependency installation and verification run only inside Docker containers mounting snapshot, without provider/write secrets or host credentials. Verification containers use `--network none`; dependency installation requires controlled registry network. Treat npm scripts and test config as executable PR input.
- [x] 6.6 Pin third-party Actions to reviewed commit SHAs; use minimal job permissions and `persist-credentials: false`.
- [x] 6.7 Separate publisher from code execution. Publisher parses bounded validated artifacts as data, never executes their scripts, shell expressions or Markdown commands.
- [x] 6.8 Compare current PR head SHA with generation/verification head before publishing; stale runs must not overwrite newer results.
- [x] 6.9 Use concurrency per PR to cancel obsolete runs; update one stable marker comment for idempotence.
- [ ] 6.10 Implemented and contract-tested; live automatic result pending trusted default-branch activation: publish decision, reason, actual skills, attempt count, test/typecheck result, commit SHA and workflow/artifact links; escape untrusted content.
- [x] 6.11 Verified fixture patch and results uploaded as GitHub artifact 15060230453 in run 45692900997. SHA-256: `ec62e4ee0e0e58d6cebfe23f770f1a7f456415bd138d65541546240973d135e6`. Patch application instructions are documented; no contributor branch is modified by the agent.
- [ ] 6.12 Status handling is implemented and contract-tested; actual PR comment pending: publish missing-key, fork, no-op, baseline-failure and final-generation-failure statuses honestly.
- [x] 6.13 Check workflow syntax and contract tests; inspect full YAML trust flow with architect.

Implementation, local contract review and real GitHub Docker fixture CI are complete. Automatic PR-comment publication still requires default-branch activation. Exit gate: a PR receives correct status/results; no secret-bearing job executes PR code; stale and repeated runs behave predictably.

## Phase 7 — Independent correction loop

Dependencies: implementation available. Owner: architect and coordinator; fixes: original specialist.

- [x] 7.1 Read automation implementation and workflows independently against acceptance criteria and trust model.
- [x] 7.2 Reproduce highest-risk negative cases: credential-bearing execution, unsafe patches, stale head, untrusted artifacts and false success reporting.
- [x] 7.3 Review frontend/backend changes for meaningful behavior, isolated mocks and preserved source contracts.
- [x] 7.4 Record actionable findings with file/line, reproduction, impact and expected corrected behavior in architect report.
- [x] 7.5 Coordinator sends findings to responsible specialist; specialist fixes and records targeted test evidence.
- [x] 7.6 Local correction checks pass: 33/33 automation cases including four PR-association cases, actionlint and diff checks. Independent coordinator rerun passed. Real Docker/GitHub CI also passed in runs 45692900997 and 45692977519. Automatic default-branch publisher activation remains separate.

Exit: no known blocking security/correctness finding; any genuine external prerequisite is explicitly listed.

## Phase 8 — Documentation, live demo and handoff

Dependencies: phases 2–7. Owner: documentation specialist and coordinator.

- [x] 8.1 Write concise `SOLUTION.md`: design, why this architecture, agent/skill locations, setup and exact commands.
- [x] 8.2 Document GitHub Actions settings, provider secret/model requirements and trusted PR/fork policy without including credentials.
- [x] 8.3 Include measured frontend/backend coverage changes and exact verification evidence.
- [x] 8.4 Distinguish local contract/provider-mock runs from real model and GitHub runs.
- [x] 8.5 Explain assumptions, current limitations, how to apply patch, and production improvements (stronger isolation, richer evals, budgets/observability, fork support if omitted).
- [x] 8.6 Coordinator runs integrated test/typecheck/coverage checks and reviews Git diff for secrets, assignment content, generated junk and accidental source changes.
- [x] 8.7 User refreshed GitHub workflow authorization; coordinator pushed complete implementation and demo branches successfully. Implementation PR #1 is published for review. No merge is authorized; trusted default-branch activation remains a separate prerequisite.
- [x] 8.8 Demo PR #2 adds the overdue filter against the implementation branch; real run 45692977519 passed. Default-branch workflow_run activation still requires merge and is documented.
- [x] 8.9 User-approved no-key gate met: real secretless CI and deterministic fixture provider with actual Docker verification/repair passed; PR/run/artifact identities recorded. Live model execution excluded and later secret/model activation documented.
- [x] 8.10 Publisher/current-head/association behavior is contract-tested; real implementation and demonstration PR CI passed. No live provider or automatic comment-publisher execution is claimed before default-branch activation.
- [x] 8.11 Ledger, architecture report and decision log record the final local checkpoint, completed association correction and published branches, successful real CI, Docker repair results and artifact evidence. Default-branch activation/automatic comment publication remain separate pending gates.
- [x] 8.12 Deliver implementation PR #1, feature PR #2, local bundle and verified CI evidence; explain remaining default-branch activation and optional live-provider setup. No automatic merge or email.

Exit: reviewable implementation and truthful demonstration evidence; task is not declared fully deployed if live prerequisites remain unavailable.

## Phase 9 — Full independent audit and hardening (2026-11-26)

- [x] 9.1 Recheck external assignment against repository deliverables; audit implementation independently in security, reliability, coverage and dependency specialties.
- [x] 9.2 Reproduce excluded-proposal false verification, setup mutation, missing repair context, snapshot corruption and Git attribute conversion; add mechanical guards and regression tests.
- [x] 9.3 Audit publication races, cross-run artifacts, initial API failure paths, bounded response/report handling and retries; add coordinator-owned fixes and negative tests.
- [x] 9.4 Add meaningful application tests without changing source/coverage exclusions: frontend 68 / backend 91; measure frontend line coverage 99.33% and backend 97.24%.
- [x] 9.5 Patch known vulnerable dependencies; actual npm audit reports zero frontend/backend vulnerabilities. Verify both production builds, Storybook build, Prisma generation and typechecks.
- [x] 9.6 Add real Docker audit probes for excluded tests and setup mutation to the existing keyless demo; unit contracts verify required rejection reasons.
- [x] 9.7 Local integrated automation suite 63/63, actionlint and diff checks pass. Independent review and reports retained.
- [ ] 9.8 Publish all audited changes and run clean GitHub CI on implementation and updated demonstration branches. Require passing positive repair and both negative Docker probes; record exact run/artifact URLs.
- [ ] 9.9 Update SOLUTION.md, audit report and bundle with actual final evidence and remaining activation/live-model boundaries.
