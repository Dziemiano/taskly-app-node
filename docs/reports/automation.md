# Automation implementation report

## Design and ownership
Implemented `Taskly Unit Test Agent` in `automation/agent.md`, tool-free Responses API adapter, deterministic controller and reusable skills. Architecture agreed with coordinator and independently reviewed by architect: trusted workflow_run controller consumes exact public PR objects as data; Docker executes only disposable snapshots; a separate publisher updates a SHA-bound marker comment and links a patch artifact.

Existing-test changes preserve the exact original prefix. New and appended tests are allowed, deletion/source/config changes are rejected. This does not prove semantic quality or prevent all JavaScript tricks, so patch review remains required. Basic skip/exclusive forms are rejected. The controller, not model prose, records baseline/attempt verification outcomes.

## Controls
- Max 2 provider attempts, 90-second provider request, 6000 output tokens; finite GitHub/network/command and job timeouts.
- 8 files/32KB each/160KB proposal; 180KB context, 500 regular snapshot files/4MB total; failures report explicit limits.
- Symlinks, traversal, source/config edits, empty or contradictory proposals, duplicate paths and prefix replacement rejected.
- Containers run as runner UID/GID with all capabilities removed, no-new-privileges, read-only root, bounded CPU/memory/pids/tmp; tests have no network. No key/token, trusted workspace, Git metadata or Docker socket mount enters containers. Named containers are forcibly removed after timeout/failure.
- Install has network to obtain public npm packages; PR npm/config remain executable only inside container. Tests use local Vitest/TypeScript executables, not model-reported success.
- Fork, missing key/model, failed ordinary CI, no-op, baseline failure and exhausted repair have distinct statuses.
- Publisher validates identity/evidence, current open head, digest and bounded report; escapes mentions/HTML and updates a bot-owned marker, paginating at most 1000 comments.

## Validation loop
- Initial `npm test` before test specialist work discovered no tests yet; this was not accepted as meaningful verification.
- All 3 skill manifests passed bundled `quick_validate.py` (exit 0).
- All workflows passed actionlint v1.7.12 (exit 0).
- Node syntax checks of controller/run/demo/github passed.
- `npm run agent:demo` reached real Docker install and returned baseline_failed because this machine denies Docker socket access (exit 1). No provider request occurred and no patch was marked verified. CI fixture must supply real Docker evidence.
- Coordinator requested runner UID/GID to prevent root-owned cleanup failure and removal of candidate .git before execution; both corrected.
- Architect/coordinator requested publisher pagination and verified-patch consistency; both corrected.
- Frontend specialist owns independent `automation/test/**` contract tests; results will be appended after execution.

## Activation and limits
User explicitly chose no API key. Live generation requires repository secret OPENAI_API_KEY and variable OPENAI_MODEL. Privileged workflow_run must first be present on the default branch, so an implementation PR alone does not activate publication. Reports and fixture demo distinguish mock-provider execution from live model generation. Real provider run is intentionally not claimed. Linux + accessible Docker required locally; GitHub ubuntu runners provide the intended verifier runtime. Ordinary CI may execute malicious PR code with read-only token; privileged generation never executes it on the host. Containers are a practical recruitment boundary, not a hardened multi-tenant microVM service.

## Independent contracts and corrections
Independent specialist added 29 behavioral scenarios covering validator paths/schema/budgets/symlinks/prefix preservation, controller baseline/no-op/repair/exhaustion/unsafe provider outcomes, applyable patches and ignored files, stale artifact cleanup, provider strict request/refusal/incomplete/errors, real trusted skill loading, snapshot exact Git commits/symlinks/env restrictions, Docker argument isolation and cleanup, publisher identity/staleness/idempotence/pagination/escaping.

`node --test --test-isolation=none automation/test/*.test.mjs`: 29 pass, 0 fail (exit 0). `npm test` also exits 0; local Node 26 reports passing test files compactly, so scenario count is taken from isolation-none run. `actionlint .github/workflows/*.yml` and `git diff --check`: exit 0.

The negative `it.each(...).skip` case exposed a validator gap. A conservative skip/exclusive-call guard now rejects it; regression passes. A reused output-directory case exposed possible stale tests.patch artifacts; controller and CLI now remove an earlier patch before producing any outcome. Explicit diff prefixes ensure patches are independent of local mnemonicPrefix config, and force-add prevents PR .gitignore from hiding proposed tests.

Additional preflight `sudo -n docker version` with approved escalation returned `sudo: a password is required` (exit 1). No host settings were changed. Coordinator reported remote push initially rejected because OAuth credentials lack workflow scope, so no real CI/container success is asserted by this report. This external gate must be rerun after authentication is corrected; missing model key remains an explicit user-approved non-live execution scope.

## Final association correction
Workflow-run PR association can be absent, particularly for fork events. Shared `resolveIdentity` now performs at most one commit-to-PR API page (100 results), requires exactly one open PR with the exact event SHA and expected base repository, and otherwise fails closed. Both generator and publisher use it. Independent tests cover present association, exact fallback selection, absent/ambiguous/stale/closed/wrong-repository candidates, invalid identity and API budget. Final local suite: **33 scenarios pass, 0 fail**, with actionlint and diff whitespace checks still exit 0. No additional provider or GitHub mutation occurred during these tests.

## Real GitHub/container verification — external gate resolved
After the user refreshed OAuth workflow scope, coordinator published the workflow branches. Read-only inspection confirms [CI run 45692977519](https://github.com/Dziemiano/taskly-app-node/actions/runs/45692977519) completed successfully, including automation job `139482979711` and both frontend/backend application jobs. The fixture step executed real Docker installation, full coverage suites and TypeScript checks.

Parsed controller output from the actual job logs:
- Provider: `fixture` (no live model request).
- Snapshot checkout SHA: `28740097eccced3bcd1bd9693b7850aa4415b1c0` (PR merge checkout); workflow head SHA: `864fe33dfdeeb867104cba1ee4fd54937a99c020`.
- Loaded skills: `analyze-test-changes`, `frontend-unit-tests`.
- Baseline: frontend 37 tests and backend 86 tests passed; install/test phases both exit 0.
- Attempt 1: install exit 0; tests exit 1, observing the intentional fixture assertion failure (40 frontend tests passed, 1 failed).
- Attempt 2: install/test exit 0; frontend 40 and backend 86 tests passed. Controller status `verified`.
- Accepted test patch SHA-256: `ec62e4ee0e0e58d6cebfe23f770f1a7f456415bd138d65541546240973d135e6`.
- [Fixture artifact 15059916505](https://github.com/Dziemiano/taskly-app-node/actions/runs/45692977519/artifacts/15059916505) contains the report and accepted test patch.

This supersedes the earlier remote-publication/container evidence blocker. Local Docker remains inaccessible, but the intended GitHub verifier environment is now proven. Prisma emitted an OpenSSL detection warning in the slim image; generation and all checks nevertheless succeeded. No source or verification weakening was needed. Live provider execution and trusted default-branch workflow activation remain separate prerequisites described in SOLUTION.md.
