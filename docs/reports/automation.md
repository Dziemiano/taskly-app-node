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
