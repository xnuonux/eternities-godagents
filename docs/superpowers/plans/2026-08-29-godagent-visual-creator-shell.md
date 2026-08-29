# Godagent visual creator shell implementation plan

**Goal:** deliver a distinctive loopback-only visual character creator over the already-reviewed operator workflow.

## Task 1: strict loopback application boundary

Test-first, create `src/creator/web/app.mjs` and `tests/creator-web-app.test.mjs`. Build a pure request handler with fixed static routes, token-protected strict API routes, bounded JSON bodies, closed errors, and workspace-derived finalization directories. No browser field may become an arbitrary filesystem path.

## Task 2: loopback server composition

Test-first, create `src/creator/web/server.mjs` and `tests/creator-web-server.test.mjs`. Parse the existing library options plus `--workspace` and optional bounded `--port`. Generate a random session token, bind only `127.0.0.1`, adapt Node requests to the pure handler, and emit one local URL without token material.

## Task 3: visual shell assets

Create `src/creator/web/index.html`, `app.css`, and `app.js`. Implement the preset rail, creator identity, concordance halo, review ledger, exact digest acknowledgement, and forge result. Use no dependencies or external assets. Ensure mobile reflow, visible focus, semantic labels, live status, and reduced-motion behavior.

## Task 4: visual and release verification

Add `creator:web` to `package.json` and accurate operator docs. Run focused tests, the guarded full suite, every historical fixture build, and historical receipt hashes. Launch the app locally, inspect desktop and mobile screenshots, fix visible defects, request independent P0/P1/P2 review, then reconcile, fast-forward merge, rerun merged gates, push, and clean the owned worktree.

No new certification receipt is claimed until the interface is paired with broader manual-choice editing or a formal visual release boundary.
