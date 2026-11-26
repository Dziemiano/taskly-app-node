# Frontend specialist report

Date: 2026-11-25. Scope: frontend tests only. Production files, dependency lockfile and coverage configuration unchanged.

## Decisions and coordination

- Read root AGENTS.md and docs/agents/frontend.md before editing.
- Proposed HTTP error/cancellation contracts, React Query mutation cache behavior and notice lifecycle to coordinator; coordinator approved these priorities with no blanket coverage target.
- Use real isolated QueryClient instances and mocked API calls to observe cache results; specifically exercise cancellation of an older pending query to protect confirmed server responses.
- Use Response objects and a restored fetch stub for HTTP tests. Use fake timers for notice lifetime, replacement and unmount cleanup.

## Changed paths

- frontend/src/lib/http.test.ts: successful requests/options/header override, 204, network rejection, abort preservation, 422, server string error and fallback for malformed/non-string bodies.
- frontend/src/features/todos/hooks/mutations.test.tsx: creation deduplication and empty cache, confirmed updates, deletion, failure cache preservation, stale pending fetch cancellation, absent cache on update/delete.
- frontend/src/hooks/useNotice.test.ts: notice lifetime, repeated-message lifetime reset and timer cleanup.

## Verification evidence

Host runtime: Node v26.8.2, npm 11.19.1.

| Command | Result |
| --- | --- |
| npm ci | Pass, exit 0, 256 packages installed; network escalation used after restricted-network attempt was interrupted |
| npm run test:coverage (baseline) | Pass, exit 0; 14 files, 18 tests |
| npm run test:coverage (new tests) | Pass, exit 0; 16 files, 37 tests |
| npm run typecheck | Pass, exit 0 |
| npx prettier --write (three changed tests) | Pass, exit 0 |
| npm test (after formatting and fetch cleanup) | Pass, exit 0; 16 files, 37 tests |
| npm run typecheck (final) | Pass, exit 0 |

Baseline coverage was captured with original useNotice test restored temporarily and new HTTP test held outside the repository. No mutation tests existed at that point. Original draft test files were then restored before implementation continued.

| Metric | Before | After |
| --- | --- | --- |
| Statements | 46.42% (78/168) | 69.04% (116/168) |
| Branches | 43.79% (60/137) | 54.01% (74/137) |
| Functions | 40.25% (31/77) | 66.23% (51/77) |
| Lines | 47.68% (72/151) | 67.54% (102/151) |

HTTP helper, notice hook and three mutation hooks reach full coverage under the existing configuration. Remaining uncovered areas include page interactions, filtering/sorting utilities, non-mutation hooks and providers.

## Correction loop and limitations

- Restricted-network npm install produced no progress; interrupted it and used the approved network-enabled npm ci command.
- Initial tests passed on first execution. Review identified the global fetch stub should be restored after each case; added beforeEach/afterEach setup with vi.unstubAllGlobals and reran tests/typecheck.
- npm ci reported 9 existing dependency vulnerabilities (7 moderate, 1 high, 1 critical); dependency updates are outside this test-only scope and were not applied.
- These are local deterministic test results. No live model or GitHub execution was performed by this specialist.
