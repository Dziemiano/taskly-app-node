# Full solution audit — 2026-11-26

## Scope and evidence standard

Independent specialists audited the agent, trust boundaries, application coverage and dependencies. The coordinator reviewed publication, event orchestration and artifact handling. Assignment requirements were checked from the external document; its text is not stored in this repository. Every confirmed defect below has a regression test or a reproducible package/build gate. Passing fixtures are not represented as live LLM evidence.

## Findings and corrections

| Finding | Impact | Correction and evidence |
| --- | --- | --- |
| Proposed test can be excluded while the original suite passes | High: false verified patch | Reject runner-excluded destinations; pass exact proposed paths/content hashes; require a passing JSON suite with actual passed assertions for each proposed file. Unit regression and real Docker exclusion probe. |
| npm setup can change the captured proposal/source before verification | High: tested files differ from offered patch | Fingerprint protected sources/config/tests, check after setup/tests, use read-only test source mount with narrow writable dependency/coverage/report overlays. Unit regression and real Docker mutation probe. |
| Stateless repair has no previous proposal | Medium: second attempt cannot reliably repair its own test | Supply bounded previous proposal with failure diagnostics. Request/controller regressions. |
| Snapshot decodes binary assets and loses executable modes | Medium: exact-head checkout is inaccurate | Preserve Git blob bytes and 100755 permissions. Binary/mode regression. |
| Git attributes/filter conversion changes emitted patch | Medium: patch can differ from candidate or invoke host clean filters | Trusted highest-precedence attributes disable text/filter/ident/encoding conversion; CRLF byte-preservation regression. |
| Provider response limit checked after unbounded read | Medium: excess allocation | Enforce byte budget while streaming and cancel the reader. Oversized stream regression. |
| Ancestor-conflicting test destinations | Low: partial candidate setup failure | Reject file/descendant conflicts and canonical-path violations before writes. Validator regressions. |
| PR can change while publisher paginates comments | Medium: stale status written after initial head check | Recheck open/current head immediately before mutation; regression changes the head between reads. |
| Older run at the same head can overwrite a newer result | Medium: obsolete report replaces current evidence | Bind report to source run ID; include bot-owned run marker and reject older runs. Publication regression. |
| Verified artifact has weak nested execution evidence | Medium: malformed report can claim verification | Require associated run identity, successful install/test phases, integrity evidence and executed proposed files; verify regular bounded artifact bytes/digest and reject stale unverified patches. Artifact/publication regressions. |
| Initial GitHub error loses report artifact | Medium: failure invisible in PR context | Testable workflow boundary persists associated error reports; ambiguous association fails closed with a diagnostic artifact. Artifact upload runs even after generator failure. Event/failure-path regressions. |
| Transient GitHub read failures and uncertain writes | Reliability | Retry reads once with a bounded delay; never retry uncertain POST automatically, avoiding duplicate comments. HTTP regressions. |
| Important application behavior untested | Coverage/correctness | Add frontend boundaries and real feature-flow tests plus backend operation-error responses. No application source or coverage-exclusion changes. |
| Vulnerable inherited dependencies | Security | Minimal compatible patched package sets, reviewed scoped overrides where upstream still pins vulnerable transitives, complete audit/build/test gates. See dependency specialist report for exact before/after versions and remaining exposure. |

## Application verification

Before this audit frontend had 37 tests and 67.54% line coverage; after behavioral additions it has 68 tests and 99.33% lines. Backend grew from 86 to 91 tests with 97.24% lines; the additional cases test error semantics rather than uncovered statements. Full frontend integration uses real feature components, HTTP wrapper and React Query, mocking only design primitives and transport. Coverage percentages are measured under the existing configuration and are not proof of semantic correctness.

Detailed evidence: [application audit](reports/audit-coverage.md), [agent audit](reports/audit-agent.md), [security audit](reports/audit-security.md), and [dependency audit](reports/audit-dependencies.md).

## Delivery and remaining boundaries

The implementation and source-only feature PR are separate. Default-branch activation of the privileged workflow still requires review/merge; no merge is implied by the audit request. The owner explicitly chose a no-key deliverable, so live model behavior remains unverified and its setup is documented in SOLUTION.md.

Docker reduces credential exposure but is not a hardened service for hostile multi-tenant code. A PR can control its test/build configuration and JavaScript assertions; no JSON report or path filter proves meaningful assertions against a deliberately deceptive runtime. Protected source integrity and observed test execution are enforced mechanically; semantic quality still requires review. Production deployment should use isolated workers with disk quotas/egress controls and representative model evaluations.

## Final integration gate

Audit corrections must pass complete local suites/typechecks/builds, dependency audits, actionlint and real GitHub Docker positive and negative probes before the audit is marked accepted. Final run URLs and counts are recorded below after actual execution.


Local integration acceptance: **63/63 automation contracts**, **68/68 frontend tests**, **91/91 backend tests**, both typechecks, frontend/backend production builds, Storybook build and Prisma generation pass. Both npm audits report zero vulnerabilities. Actionlint and Git diff checks pass. Independent security review found an additional cleanup-after-patch error-path bug; outcome handling now deletes that patch before persisting an error, and its regression verifies the artifact remains publishable. Real CI remains the final gate for the new read-only mounts and negative probes.
