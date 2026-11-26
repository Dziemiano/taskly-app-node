# Independent application and test completeness audit

Date: 2026-11-26. Ownership: frontend/**, backend/** and this report. Application production files, dependency lockfiles and coverage configuration remain unchanged.

## Scope and findings

Read the working agreement, existing frontend/backend tests, production selectors/validation/hooks/page/editor/dialog/HTTP code and coverage reports. The prior application suites passed, but frontend coverage relied heavily on isolated child/hook mocks and omitted several important behavioral contracts. These were concrete test gaps rather than demonstrated application defects:

- Validation limits, impossible calendar dates and leap dates, title/description trimming boundaries.
- Completed filtering, due/newest sort ordering and ties, empty results and source-array preservation.
- Local calendar-day overdue semantics and calendar-date presentation.
- Filter-state composition and rerender with fresh server data.
- Writable update payloads, omitted fields versus explicit null, and DELETE error propagation.
- Full task feature orchestration through real query/mutation cache, HTTP and components: creating, editing, deleting, completing, retrying and unmount cancellation.
- Backend tests exercised unexpected health failure, but did not individually establish generic HTTP 500/data-hiding behavior for each task repository operation.

No production behavior defect was found in these audited paths. Passing unit/component tests does not establish browser layout, real PostgreSQL behavior or dependency safety.

## Added behavioral tests

- `frontend/src/features/todos/utils/todos.boundaries.test.ts`: 18 cases for validation, selectors, local-day behavior and date formatting.
- `frontend/src/features/todos/hooks/useTodoFilters.test.ts`: real hook composition and fresh-data rerender without resetting user-selected state.
- `frontend/src/features/todos/api/todos.test.ts`: PATCH writable-field/undefined/null serialization and DELETE failure behavior.
- `frontend/src/features/todos/TodosPage.integration.test.tsx`: 10 feature component integration cases. Only design-system presentation primitives are simplified; AppProviders, HTTP helper, React Query, feature hooks, forms, dialogs, notices and cache updates execute production code. Cases cover creation with trim/priority, edit failure and retry, in-flight busy blocking, completion and reactivation, delete failure and retry, initial-query retry, last-observer request abortion, search/status composition and cancel-without-write behavior.
- `backend/tests/factory.test.ts`: five GET-list/GET-item/POST/PATCH/DELETE failure cases; mocked Prisma I/O rejects with sensitive-looking diagnostics, while public responses remain generic and diagnostics stay in the server logger.

These backend checks are HTTP component tests using real Express and temporary localhost sockets; Prisma I/O is mocked and no PostgreSQL instance is used.

## Verification and correction loop

| Command | Actual outcome |
| --- | --- |
| frontend `npm run test:coverage && npm run typecheck` baseline | Exit 0, 37 tests / 16 files; typecheck passed |
| frontend initial expanded `npm test` | Exit 1, four test assertions assumed a `status` role supplied by a presentation primitive that the test intentionally mocks |
| frontend corrected full suite | Exit 0, 65 tests, typecheck passed |
| frontend final `npm run test:coverage && npm run typecheck` | Exit 0, 68 tests / 19 files, typecheck passed |
| backend `npm run typecheck` | Exit 0 after added cases |
| backend restricted `npm run test:coverage` | Exit 1 from localhost `listen EPERM`; 32 socket-based checks failed before application responses, not assertion mismatches |
| backend approved `npm run test:coverage && npm run typecheck` | Exit 0, 91 tests / 8 files; typecheck passed |

The frontend role assertions were corrected to assert visible notice text, since the existing design-system mock deliberately omits the real Alert component's default role. Production Alert supplies the expected role; no application change or expectation weakening was used to conceal a production defect.

The first backend append command used a duplicated backend path while already inside backend; it wrote no file. Corrected the path from the repository root before running verification. The initial restricted backend result was not counted as application failure or passing verification.

## Measured coverage

| Metric | Frontend before | Frontend after | Backend after |
| --- | --- | --- | --- |
| Statements | 69.04% (116/168) | 97.61% (164/168) | 96.89% (125/129) |
| Branches | 54.01% (74/137) | 90.51% (124/137) | 97.91% (47/48) |
| Functions | 66.23% (51/77) | 98.70% (76/77) | 96.87% (31/32) |
| Lines | 67.54% (102/151) | 99.33% (150/151) | 97.24% (106/109) |

Backend baseline was 86 passing tests and the same coverage totals, established by existing specialist/CI evidence. Five new failure scenarios improve semantic guarantees without changing aggregate coverage. A coverage percentage is not proof that all important states have been tested.

## Remaining limits and handoff

Remaining frontend branches primarily include defensive busy guards, optional presentation states and combinations of due-date badges. The untested frontend line is a due-date input change handler; selectors/validation/HTTP null/date boundaries have dedicated tests. Backend uncovered lines remain the main entrypoint and the error-handler headers-already-sent delegation. These do not justify artificial implementation-mirroring tests or altering source/configuration solely to reach 100%.

No browser automation, live PostgreSQL, model calls, Docker invocation or GitHub mutation was performed by this specialist. The coordinator must integrate these application tests with automation-audit changes and run the real CI gate. Existing fixture candidate test counts will rise with this baseline: 68 frontend baseline cases plus three fixture cases = 71 frontend accepted-candidate cases; backend baseline/candidate = 91.
