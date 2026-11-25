# Decisions and coordination log

## D001 — Isolated checkout
The supplied workspace contained an empty Git repository with read-only .git. The application was cloned into taskly-app-node, preserving its upstream history and avoiding changes to the outer repository metadata.

## D002 — Ownership and review
User explicitly requested parallel specialist agents and a supervisory correction loop. Role agreements define exclusive paths, evidence requirements and coordinator publication ownership.

## D003 — Architecture review changed the generation boundary
Architect challenged a combined model/test job because PR tests, build configuration and npm lifecycle scripts are executable input. Coordinator accepted direct Responses API generation without tool execution rather than a Codex CLI carrying general shell tools. The named custom agent will load trusted reusable skill contents and produce structured JSON test file proposals; a deterministic controller validates output.

## D004 — Isolation and trusted publication
A secretless `pull_request` CI feeds a trusted `workflow_run` controller. Controller and policy are checked out from the trusted default branch, while exact PR head is exported as inert source data without `.git` or agent policy. Dependency installation and tests run in Docker with snapshot-only mount and no provider/GitHub write credentials; test execution has network disabled. Publisher is a separate minimal-permission job, treats artifacts as data and checks current PR head SHA. Bounded controller budget: at most two generation attempts, one repair. Generated tests are delivered as patch artifact plus one updated PR comment, avoiding contributor-branch write loops.

## D005 — Explicit live-execution scope
Coordinator relayed that user chose preparation and launch instructions without provider key. Local provider mocks and real secretless CI are required evidence; real model execution is excluded from the current completion gate. Documentation must distinguish these evidence classes and give activation prerequisites. `OPENAI_MODEL` is explicit configuration rather than an assumed newest model.

## D006 — Remaining implementation contracts
Responses carry decision/rationale/skills and test-file proposals; controller independently records attempts and actual verifier results. No-op cannot carry files. Model output never supplies trusted test-success evidence. Allow only regular test files within frontend/backend conventions; reject traversal, symlinks, source/config edits and oversize payloads. Existing-test edits need review because semantic weakening cannot be proven absent by a path allowlist. Existing test failures and generated-test failures need distinct statuses. Publication checks artifact head against current PR head and updates a stable marker comment.

## D007 — Verification filesystem corrections
Coordinator/architect review required Docker to run as the host UID/GID so installed packages and coverage files remain removable by controller. The controller removes its temporary candidate `.git` after capturing the proposal patch and before container execution. Named containers are forcibly removed in `finally`, including after command timeouts/output-budget failures. Only disposable source snapshot is mounted; no trusted checkout, Docker socket or provider/GitHub secret is mounted.

## D008 — Proposal preservation and deterministic patches
Generated changes to existing test files must preserve the exact original prefix and append content; new focused files are preferred. Mechanical controls reject basic skip/exclusive forms and any source/config/deletion proposal. This makes original test preservation auditable but cannot prove semantic assertion quality, so review remains required. Git patch staging must include otherwise ignored generated tests and use stable explicit prefixes; patch is captured before untrusted verification can mutate the candidate.

## D009 — Publisher review corrections
Independent review found first-page comment lookup could create duplicates after 100 comments. Publisher now paginates with a finite 1000-comment budget and fails explicitly at the cap. A verified status requires test patch identity and SHA-256 metadata; nonverified statuses cannot carry a verified patch. Publication entrypoint validates bounded regular artifact files and patch digest, and checks current open PR head before comment mutation.

## D010 — Publication and container evidence remain external prerequisites
Integration checkpoint: local implementation commit `71cba02` exists, and remote draft PR #1 contains preceding application-test commit `aa62e02`. GitHub rejected the workflow push because the OAuth token lacks `workflow` scope; SSH fallback failed public-key authentication. Local Docker socket is inaccessible and sudo requires a password. Coordinator requested user direction on refreshed GitHub authorization or local handoff. No complete workflow publication, real container CI result or automatic PR comment is claimed. These constraints do not invalidate passing local tests, but keep the corresponding integration gates pending. Live model execution remains deliberately outside the user-approved no-key scope.

## D011 — Final local evidence and pending small reliability correction
Coordinator independently reran 33/33 passing automation contract cases, including four bounded PR-association cases, plus actionlint for all workflows and diff checks (all exit 0). Frontend/backend test and coverage evidence remains unchanged. The bounded PR-association fallback for workflow_run events that omit pull_requests is complete and verified. The final implementation is on the local implementation branch; earlier commit identifiers describe historical checkpoints, not the forthcoming final documentation commit. Remote publication and real Docker/GitHub evidence remain pending; no authorization reply has arrived.
