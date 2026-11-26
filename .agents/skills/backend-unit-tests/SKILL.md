---
name: backend-unit-tests
description: Propose Taskly Express, validation, repository and lifecycle tests for changed backend behavior.
---

Use Vitest in backend/tests/**/*.test.ts. Use Supertest for app/router contracts and injected TodoStore or mocked Prisma IO. No PostgreSQL or external services are available. Cover validation, missing records and error propagation when affected by a diff. Restore environment, process spies and timers. Never exit the runner. Import conventions follow existing tests. Preserve existing test files exactly before appending cases.
