# codex recoverable turn journal v1 implementation plan

## goal

Build and certify the inert durable transaction substrate required for exact recovery of a phase-3 Codex bound turn, without claiming a live transport adapter or granting new authority.

## implementation sequence

### 1. freeze schemas and contract tests

- add strict schemas for journal state, journal events, and transport-execution witnesses;
- register the schemas;
- write failing tests for deterministic transaction identity, create and existing-task opening, exact retry, operation-id collision, and closed input fields.

### 2. implement canonical journal replay

- derive one safe transaction directory from transaction identity;
- bound the journal before parsing;
- verify canonical bytes, state digest, event chain, timestamps, event vocabulary, and semantic transitions;
- serialize mutation with the existing recoverable file lock;
- atomically replace and reread every changed state.

### 3. implement reservation and attempt lifecycles

- record and verify one create reservation or one existing task;
- record ordinal binding attempts with active receipt, dispatch digest, envelope digest, and lease expiry;
- support exact-idempotent attempt abandonment only after a verified closed binding and before transport completion;
- reject task, actor, attempt, dispatch, and receipt substitution.

### 4. implement response and transport evidence

- define and verify the transport-execution witness;
- publish exact UTF-8 response blobs exclusively under their digest;
- verify response byte count and digest against both the phase-3 transport receipt and execution witness;
- require start and completion within the active binding lease;
- distinguish dispatch reconciliation from completed transport in the recovery projection.

### 5. implement closure and terminal recovery

- record exact phase-2 lifecycle closure;
- accept only an exact phase-3 host receipt cross-linked to the successful attempt;
- recover terminal response text and receipt from disk without transcript input;
- implement cancellation and quarantine as terminal, auditable outcomes.

### 6. prove crash, mutation, and containment behavior

- reconstruct a new journal object after every durable boundary;
- test exact retries and changed retries;
- mutate event order, state and event digests, response bytes, receipt links, and lease times;
- test bounded-file rejection before parse;
- prove trusted metadata contains no transcript, credentials, paths, continuity content, skill bodies, or Realm authority.

### 7. certify and integrate

- build one deterministic fixture with create, continue-shaped, abandoned-attempt, and accepted paths;
- freeze source and test manifests at a source commit;
- issue an append-only certification receipt linked to every historical receipt;
- run focused tests, the full suite, certification ledger verification, and release-lineage verification;
- merge by fast-forward, push canonical main, and remove only the clean merged worktree and branch.

## later integration boundary

The next milestone will add a recoverable coordinator and trusted transport reconciliation interface. It may consume this journal but may not weaken or regenerate its frozen receipt implicitly.

