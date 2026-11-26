# Dependency security audit and remediation

Date: 2026-11-26. Ownership: frontend/backend package manifests and lockfiles, this report only. No application source, agent code, workflow or Git state changed by this specialist.

## Scope and baseline

Coordinator's actual baseline `npm audit --json` reported frontend 9 affected packages (7 moderate, 1 high,1 critical) and backend 12 (5 moderate, 7 high). These counts include dependency chains, not distinct vulnerabilities. The user requested a complete security audit and authorized fixing confirmed risks; this pass therefore resolves previously documented inherited dependency issues.

Primary advisories consulted:
- [Storybook origin validation/code injection](https://github.com/advisories/GHSA-f2ph-cmg5-wxc8), fixed 10.6.2 or later.
- [body-parser compressed-body DoS](https://github.com/advisories/GHSA-27r3-jxmh-p828), fixed 2.4.0.
- [Zod constrained-collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), fixed 4.6.6.
- [Effect TemplateLiteral ReDoS](https://github.com/advisories/GHSA-7589-6fvf-x4pw), fixed 3.22.1.
- [Glob cancellation/traversal](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), fixed 14.0.2.

Registry package metadata confirmed all selected exact versions. Changes preserve direct dependency major/minor lines:

| Area | Before | After |
| --- | --- | --- |
| Storybook core and React Vite adapter |10.6.1|10.6.9|
| Vite |6.4.3|6.4.6|
| Vitest and coverage-v8 (both apps) |4.1.11|4.1.12|
| Prisma CLI, client, pg adapter |7.10.0|7.10.1|
| Zod |4.6.5|4.6.7|

Compatible transitive lock updates resolve body-parser2.4.0, qs6.17.1 and fast-uri3.1.9. Two upstream pins prevented complete remediation without narrow overrides:

- `@joshwooding/vite-plugin-react-docgen-typescript → glob 14.0.6`. The upstream 0.7.0 plugin specifies glob^13.0.1, whose entire published13.x line is affected. Inspected caller uses `globSync(pattern, {absolute,cwd})`; glob 14 preserves this API. The override is restricted to this caller, with actual full Storybook build passing. Its minimatch dependency resolves 11.0.9. Remove the override when upstream adopts a patched range. This is the one scoped transitive-major override; no direct Storybook major downgrade was applied.
- `@prisma/config → effect 3.22.1`. Prisma 7.10.1 pins effect 3.20.0, leaving the confirmed ReDoS. Same-major patched 3.22.1 passes Prisma config loading, client generation, backend compilation and all backend tests. Remove override after Prisma updates the upstream pin.

Automatic `npm audit fix --force` suggestions to downgrade Storybook to 8.x or Prisma to 6.x were deliberately rejected because they would replace established integration APIs.

## Verification and correction loop

Host: Node 26.8.2, npm 11.19.1. Commands used approved network execution for registry access; backend tests require temporary localhost sockets.

| Command | Actual result |
| --- | --- |
| Frontend targeted `npm install --save-dev --save-exact ...` |Pass; high/critical resolved, 4 moderate remained|
| Backend targeted matched Prisma/Vitest/Zod updates and compatible transitive refresh |Pass; 3 propagated Effect high findings remained|
| Both scoped override installs |Pass; both installs reported 0 vulnerabilities|
| Frontend final `npm audit --json` |Exit0; all severity counts 0|
| Backend final `npm audit --json` |Exit0; all severity counts 0|
| Frontend `npm test` |68/68 tests,19 files, exit0|
| Frontend `npm run typecheck` |Exit0|
| Frontend `npm run build` |Exit0, Vite 6.4.6 production bundle|
| Frontend `npm run build-storybook` |Exit0, Storybook 10.6.9 with scoped glob override|
| Backend `npm run db:generate` |Exit0, Prisma Client 7.10.1|
| Backend `npm run typecheck` |Exit0|
| Backend `npm run build` (including prebuild client generation) |Exit0|
| Backend `npm test` |91/91 tests,8 files, exit0|
| `git diff --check` on four owned files |Exit0|

The initial Storybook build in the command sandbox stopped before compilation because `os.networkInterfaces()` was denied (`uv_interface_addresses`). Retried the identical build with approved execution; the real Storybook build passed. No source/configuration adjustment was made to bypass this environment restriction.

Npm emitted install-script approval warnings under local npm 11. All explicit Prisma generation and frontend/backend/Storybook builds passed. GitHub's Node 22/npm runtime still needs its normal clean-install CI gate; local npm results are not a claim of Docker success.

## Results and limits

Final actual `npm audit` reports frontend 0/backend 0 known vulnerabilities at audit time. This is registry-advisory coverage, not proof of absence of undisclosed vulnerabilities. Audits should be repeated as advisories evolve. Two scoped overrides are explicit maintenance debt and must be checked when their upstream consumers change. The tests/builds above establish compatibility for this repository, not a universal guarantee of glob 14 compatibility for every consumer.
