# recoverable codex turn coordinator v1 implementation plan

## goal

Connect the certified binding and journal layers through one recovery-first, exact-idempotent coordinator without claiming unsupported live Codex task controls.

## implementation sequence

### 1. freeze coordinator contracts

- add strict recovery-descriptor, combined transport-binding, and recoverable host-receipt schemas;
- expose behavior-preserving phase-3 request, descriptor, binding-request, envelope, and dispatch verifiers/builders;
- add a generic parent-receipt verifier for phase-3 and recoverable receipts.

### 2. expose exact registry reconciliation

- add read-only lookup by binding id through the existing locked expiry-reconciliation path;
- return only verified active or lifecycle receipts;
- test missing ids, active lookup, expiry, mutation rejection, and credential absence.

### 3. expose trusted journal recovery evidence

- add a host-only recovery read returning verified opening, reservation, attempts, terminal evidence, and exact response bytes when present;
- preserve the bounded public projection;
- extend acceptance to the recoverable receipt and process-death expiry case without weakening phase-3 released-only receipts.

### 4. implement recovery-first reservation

- open the journal before transport use;
- bind task-control and recovery descriptors into one digest;
- reconcile reservation before reserve;
- record reserved or cancelled receipts exactly;
- prove interruption after external reservation but before journal publication resumes without duplicate task creation.

### 5. implement recovery-first dispatch and binding recovery

- prepare one journal attempt while holding the exact phase-2 handle;
- reconcile dispatch before calling it;
- dispatch once only when reconciliation proves absence and the process owns the attempt handle;
- after reconstruction, reconcile absent dispatch against exact binding status;
- wait on active orphan binding, then explicitly close and abandon after terminal expiry before rebinding.

### 6. implement recoverable finalization

- record exact transport completion and response blob;
- release a live handle or reconcile a dead handle through exact registry lookup;
- issue a recoverable host receipt for released or safely expired completion;
- quarantine revoked completion;
- return terminal journal state with no external calls on exact retry.

### 7. run crash and adversarial matrices

- inject process-shaped interruption after reservation, binding acquisition, attempt publication, external dispatch completion before journal publication, transport publication, binding closure, and acceptance;
- reconstruct coordinator, advance lease and stale-lock clocks where required, and prove one task, one completed dispatch, one accepted receipt, and no duplicate effects;
- test descriptor downgrade, ambiguous reconciliation, parent mismatch, candidate drift, response mutation, revocation, and malicious model text.

### 8. certify and integrate

- freeze a deterministic create, continue, compaction-resume, and crash-recovery fixture;
- commit source before issuing the receipt;
- run focused and full tests with no skips;
- add the receipt to the append-only ledger and refresh release-lineage assertions;
- fast-forward main, rerun all gates, push, and remove only the clean merged worktree and branch.
