# Godagent local creator CLI implementation plan

**Goal:** deliver one tested local operator shell over the certified creator protocol without adding a privileged creation path.

**Architecture:** a reusable workflow service owns catalog, preview, and finalize orchestration. A strict CLI parser converts argv into that service and emits canonical JSON or closed failures.

## Task 1: strict parser and closed errors

Create `src/creator/cli-contracts.mjs` and `tests/creator-cli-contracts.test.mjs` test-first. Accept only `catalog`, `preview-preset`, and `finalize-preset` with exact command-specific options. Reject duplicates, unknowns, missing values, empty values, and credential-shaped option names without echoing values.

## Task 2: reusable operator workflow

Create `src/creator/operator-workflow.mjs` and `tests/creator-operator-workflow.test.mjs` test-first. Load the same certified catalog, replay presets through `replayCreatorPreset`, produce one bounded preview projection, and finalize only after exact expected-preview-digest comparison. Prove mismatch and blocked state create no directories.

## Task 3: thin CLI and process behavior

Create `src/creator/local-cli.mjs` and `tests/creator-local-cli.test.mjs` test-first. Emit one canonical JSON value on success. Emit only `{ schemaVersion: 1, status: "failed", code }` on failure. Add `creator:local` to `package.json` and document examples with fixture paths but no secrets.

## Task 4: verification and integration

Run the focused tests, full guarded suite, all historical fixture builds, and the Phase 3 receipt reproduction at its pinned source commit. Request independent review for P0/P1/P2 findings. Fetch and reconcile `origin/main`, fast-forward merge, rerun merged gates, push, verify parity, and clean the owned worktree.

Historical build IDs and all five certification receipt files must remain byte-identical. No new certification receipt is claimed for this small shell slice; its acceptance rows remain implementation tests until a broader interface release boundary is assembled.
