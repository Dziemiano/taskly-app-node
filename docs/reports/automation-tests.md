# Automation contract testing specialist report

Date: 2026-11-25. Scope: automation/test/** only; production corrections implemented by automation specialist following reproduced failures.

## Contract coverage

29 behavioral cases in six test modules:

- contracts: canonical test paths, source/traversal/control-character rejection, exact schema, decision/file consistency, duplicate/file count/file byte/aggregate byte budgets, append-only existing files, skipped/exclusive chained tests, symlink ancestors/files and directory targets.
- provider: strict structured schema request, no model tools, context passed as untrusted data, missing key, HTTP failure, refusal, incomplete/ambiguous/malformed output; real repository skill files loaded, missing skills rejected.
- controller: nonbehavioral skip, baseline failure blocks provider, verified test-only patch SHA-256 and git apply --check, immutable input snapshot, failed first verification fed back into second attempt, two-failure limit, invalid proposals/provider errors, provider noop, Git-ignored new test inclusion, stale patch cleanup when reusing output directory.
- verifier: secretless explicit child environment; no Docker socket, privileged execution or host network; disabled test network; CPU/memory/process/read-only controls; install/test cleanup on success, install failure and timeout using fake runner.
- GitHub: trusted workflow identity, invalid commit rejection, closed/stale PR blocks writes, idempotent own-bot marker update, ignores spoofed user marker, pagination before create, report identity/evidence validation, escaped report text, HTTP failure.
- snapshot: exact committed application content rather than dirty working copy; excludes unrelated policy; rejects symlink modes/environment files; context binds base/head diff and includes neighboring tests; changed-file count budget.

## Review and correction loop

1. First full run exposed a test assumption about Git diff prefixes: this host enables mnemonic prefixes i/ and w/. Replaced brittle fixed-header assertion with actual git apply --check and digest verification. No production change needed.
2. Coordinator requested a Git-ignore regression. Added a snapshot with frontend/.gitignore ignoring *.test.ts; test now confirms proposed test is still included in the patch and can be applied. Automation specialist strengthened staging and empty-patch rejection.
3. Added test.concurrent.only and it.each([1]).skip cases. The latter reproduced a validation gap. Automation specialist expanded conservative focused/skipped call rejection; contract rerun passed.
4. Reported possible stale tests.patch in reused output directory. Automation specialist added startup cleanup; regression confirms noop cannot leave earlier verified patch behind.
5. Publisher specialist strengthened validation and pagination; tests verify metadata/identity mismatch is rejected before any API access and own marker is updated after paginated read.

## Commands and actual results

- ./frontend/node_modules/.bin/prettier --write automation/test/*.test.mjs — pass, exit 0.
- npm test — pass, exit 0, all six test files. On host Node v26.8.2 the isolated reporter summarizes files.
- node --test --test-isolation=none automation/test/*.test.mjs — pass, exit 0, **29 cases**, no skipped/todo tests.

No API key, real model, Docker daemon or GitHub write calls are used by these contracts. Fake provider/verifier/API results exercise controller behavior and trust boundaries. Real Docker/GitHub/model verification remains a separate integration gate owned by the coordinator. Static detection of focused tests cannot establish semantic correctness for arbitrary JavaScript; test patches still require review and execution.

## Follow-up: workflow PR association reliability

GitHub workflow_run events can omit pull_requests. Added four tests of the shared asynchronous identity resolver with fake API: explicit associations avoid fallback; empty association resolves one open exact-head/base-repository match while ignoring unrelated candidates; absent/ambiguous/stale-head/wrong-repository/closed candidates reject; invalid commit and 100-result budget reject before an unsafe association is accepted. Both production entrypoints use the resolver (production change owned by automation specialist).

Final verification after this correction: npm test exit 0, six files; node --test --test-isolation=none automation/test/*.test.mjs exit 0, **33 cases passed**, zero skipped/todo. github.test.mjs formatted with bundled frontend Prettier.
