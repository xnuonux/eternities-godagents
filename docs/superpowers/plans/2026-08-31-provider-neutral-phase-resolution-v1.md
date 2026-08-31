# provider-neutral signed phase resolution v1 implementation plan

## milestone

Certify one additive provider-neutral signed resolution protocol for the neutral durable engine and Anthropic Messages transport without changing any released OpenAI resolution byte.

## implementation sequence

1. add failing policy, witness, and decision tests using a generated local Ed25519 fixture key. prove exact fields, canonical pinning, transport binding, lifetime, response ceiling, signature, operation identity, disposition, and witness binding.
2. add the provider-neutral policy schema, schema registry entry, policy loader, response-witness builder, and signed-decision verifier.
3. add failing neutral durable-operation tests for pending-only admission, exact adoption, abandonment, accepted-decision recovery, expiry, collision, terminal immutability, unknown entries, symlinks, and zero network calls.
4. extend the neutral durable engine with an optional operator port. reuse its lock, request compiler, provider response inspector, completion verifier, provider evidence verifier, exclusive publisher, and evidence-before-completion order.
5. add failing Anthropic suite tests for native, review, and revision adoption, provider evidence, secret containment, exact replay, and response ceiling.
6. wire one explicit Anthropic operator controller using the neutral policy and operation port.
7. add failing host SDK tests for exact capability advertisement, optional extension presence, closed configuration, no ambient routing, and unchanged common phase methods.
8. expose the separately described resolution extension through the selected host only after policy loading.
9. add deterministic fixture and receipt builders, schemas as needed, certification tests and document, receipt ledger row, release lineage coverage, package commands, architecture notes, and README usage.
10. prove the six protected parent hashes remain exact. run focused tests during development and the full suite only at the final release gate.
11. create a source commit, build deterministic evidence against it twice, perform an inline adversarial review, create a release commit, reconcile upstream, fast-forward main, push, verify local and remote equality, and remove only the clean merged worktree and branch.

## test discipline

Every production behavior begins with a focused test that fails because the provider-neutral capability does not yet exist. Expectations use hand-derived protocol literals and observable files or results. Provider HTTPS remains a local injected fixture. No test uses a real credential, private key, or external provider.

## abort conditions

- any protected parent hash changes;
- any resolution path can perform a provider request or publish a second attempt;
- provider evidence can be bypassed for Anthropic adoption;
- a changed or expired unaccepted decision mutates durable state;
- the host exposes signing authority or ambiently selects a provider;
- receipt reproduction or release lineage differs across clean builds.
