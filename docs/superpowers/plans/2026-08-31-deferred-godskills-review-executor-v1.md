# Deferred Godskills review executor v1 implementation plan

Date: 2026-08-31

## 1. Close the recovery context gap

- Add a failing kernel regression proving review reconciliation receives the
  exact committed admission, subject, and prior-review context.
- Pass one immutable context to both reconcile and execute without changing the
  existing executor descriptor contract.

## 2. Freeze transport, dispatch, and completion contracts

- Add strict schemas and semantic verifiers for one authority-empty transport
  descriptor, dispatch, and completion.
- Bind all request, materializer, package, executor, transport, byte, token, and
  time identities.

## 3. Build the provider-neutral executor

- Construct the certified materializer from one exact release pin.
- Verify the transport descriptor once and derive a content-addressed review
  executor descriptor.
- Materialize, verify, and build the same dispatch for reconcile and execute.
- Validate one completed transport result and convert it to a mission phase
  result.

## 4. Harden recovery and hostile cases

- Prove absent, pending, completed, and ambiguous reconciliation behavior.
- Inject process death after transport completion and recover without
  redispatch.
- Reject changed request, context, package, transport identity, completion,
  usage, authority, timestamps, and byte ceilings.
- Prove no provider, credential, Realm, continuity, or keel field can enter the
  closed contracts.

## 5. Integrate and release

- Run the complete review-materializer, release-verifier, mission-kernel, and
  executor matrix.
- Perform an inline adversarial review and fix confirmed defects test-first.
- Build a deterministic crash-recovery fixture and append-only receipt.
- Verify the complete suite, receipt ledger, and release lineage.
- Fast-forward main, push, and remove only the completed feature worktree.
