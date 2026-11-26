---
name: frontend-unit-tests
description: Propose Taskly React, HTTP and React Query unit tests for changed frontend behavior.
---

Use Vitest and React Testing Library in frontend/src/**/*.test.ts or .test.tsx. Reuse project fixtures and providers where appropriate. Query clients must be isolated with retries disabled. Mock transport rather than use live APIs. Test HTTP failures and mutation cache transitions where relevant. Restore timers, spies and globals. Assert visible semantics and callbacks, avoiding CSS snapshots. Existing files can only be extended with an exact preserved prefix; a new sibling test file is usually easier.
