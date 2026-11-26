# Independent custom-agent reliability audit

Date: 2026-11-26. Scope: controller, proposal validation, provider response handling, source export, repair protocol and their tests. This pass challenged the existing implementation instead of relying on previous passing CI. No remote mutation was performed by this auditor.

## Confirmed findings and corrections

### A1 — Proposed tests could be excluded from execution (high)

`validateProposal` accepted paths such as `frontend/src/node_modules/hidden.test.ts`. A real local Vitest reproduction placed a passing visible test next to a failing test under that directory: Vitest exited 0 and reported only the visible test. Full-suite success therefore did not establish that the proposed test executed.

The validator now rejects runner-excluded `node_modules`, `dist` and `.git` path segments. The controller passes exact proposed paths and SHA-256 content digests through `verify(candidate, { expectedTests })`; the security auditor owns the independent verifier implementation that checks execution reports and content integrity. Rejecting well-known excluded paths is defense in depth; actual expected-suite execution is the acceptance requirement.

Regression: excluded path and conflicting ancestor proposals are rejected; controller passes exact paths/hashes. Temporary reproduction `/tmp/audit-discovery.mjs` exited 0 with one executed visible case while the hidden failing case was absent, confirming the original defect.

### A2 — Stateless repair omitted the failed proposal (medium)

A second Responses API request previously received original source context and verification diagnostics, but no previous response history or generated files. The agent could not reliably edit its own failed test proposal. The deterministic fixture concealed this by returning a predefined second response.

The failed, already validated complete proposal is now included in repair feedback alongside verification evidence. It remains untrusted data and is bounded by existing proposal size limits. Regressions inspect both the controller's second invocation and the provider request payload.

### A3 — Export corrupted binary bytes and executable modes (medium)

Source export decoded every Git blob as UTF-8 and wrote it with the default mode. A tracked PNG byte fixture `[137,80,78,71,255,0,128]` became UTF-8 replacement bytes, and a tracked `100755` shell script became `0644`. This violated the exact-commit snapshot contract and could produce baseline failures for ordinary assets or npm scripts.

The process specialist added raw buffered output support. Export now reads Git blobs as bytes and explicitly restores `0755` or `0644` from the allowed Git mode. A real temporary Git repository test verifies byte equality and both modes.

### A4 — Provider response limit applied after full allocation (medium)

`response.text()` previously read an entire response before checking its size. The controller now reads incrementally, stops and cancels the response stream as soon as the existing byte budget is exceeded, and concatenates only bounded bytes. HTTP error bodies are cancelled as well. A synthetic 100-chunk stream proves early cancellation rather than reading the whole body.

### A5 — Git clean/EOL attributes could transform the emitted patch (medium)

The temporary Git repository inherited PR `.gitattributes` and host Git conversion settings during staging/diff. A patch could differ from the exact proposed bytes that were verified, and configured clean filters could execute on inert PR content.

A trusted `.git/info/attributes` file now overrides text, filter, ident and working-tree-encoding conversion before staging. Git diff already disables external diff/textconv and uses explicit prefixes. A regression applies the emitted patch and asserts exact CRLF and `$Id$` bytes despite conflicting PR attributes.

### A6 — Conflicting generated paths bypassed schema validation (low)

A proposal could contain a test file and a nested path below that same file. It passed path checks but failed later during filesystem creation, skipping the intended validation/repair path. The validator now rejects ancestor/descendant conflicts before materialization.

## Evidence and commands

- `node /tmp/audit-snapshot.mjs`: confirmed original binary inequality and executable mode 644.
- `node /tmp/audit-discovery.mjs`: confirmed ignored failing proposed test with exit 0.
- `node --test --test-isolation=none automation/test/controller.test.mjs automation/test/contracts.test.mjs automation/test/provider.test.mjs automation/test/snapshot.test.mjs`: 25 scenarios pass, 0 fail, exit 0 after fixes.
- Existing repository Prettier executable formatted eight owned implementation/test files; `git diff --check`: exit 0.
- The coordinator must run the integrated suite and actual GitHub Docker fixture after the independently owned verifier changes land. The selected local tests above do not claim real Docker or live-provider execution.

## Remaining explicit limits

No runtime validator can prove the semantic value of arbitrary JavaScript assertions. Append-only text preservation and actual test execution constrain mechanical failures, while human review remains necessary for useful assertions and mocked behavior. A determined PR can influence its own test configuration; containers and host-side checks reduce exposure but are not a hardened hostile multi-tenant isolation boundary. Live model generation remains outside the user's no-key verification scope. Automatic default-branch publication still requires separately authorized activation.
