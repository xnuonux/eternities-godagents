# Receipt-Bound Typed Executor Bundle v1 Design

## purpose

The admitted sealed typed execution host currently verifies exact executor
descriptors but receives the corresponding functions from its caller. This
milestone adds a sibling launcher that resolves those functions from one
externally pinned, locally verified executor bundle. It removes caller-selected
executor code from the new path without changing any certified host byte or
existing launch path.

## boundary

The bundle is a canonical receipt plus one self-contained ECMAScript module per
capability. The operator pins the receipt file SHA-256 through
`GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256`. The receipt binds:

- protocol and bundle identities
- an exact, sorted capability set
- each module's canonical repository-relative path, SHA-256, and byte count
- each authority-empty executor descriptor
- a logical receipt digest over every preceding field

The public sibling launcher accepts only `admissionRoot`, `policyPath`,
`executorBundleRoot`, `executorBundleReceiptPath`, `request`, and `env`. It has
no `executors`, loader, import, filesystem, cache, clock, lock, registry, or
runner hook.

## exact-byte loading

The verifier uses native filesystem operations. On a quiescent filesystem it
rejects absolute, non-canonical, escaping, observed symbolic-link, duplicate,
missing, or changed receipt and module paths. It reads each module once and
verifies its exact bytes. A pinned standards-compliant ECMAScript parser then
requires one exported asynchronous `execute(input)` declaration as the entire
program and rejects import expressions anywhere in its syntax tree.
Receipt-certified executor source remains trusted code.

Verification is inert. The launcher first binds the complete descriptor set to
the externally pinned policy and verifies that policy against the admitted
genesis identity. Only then is the parser-identified `export` prefix removed
without changing the verified function body, and the resulting declaration is
compiled in a fresh restricted VM context for each invocation. The context has
no injected `process`, `require`, `module`, loader, network, or host object. Its
input crosses as canonical JSON, output returns as JSON, and string or WebAssembly
code generation is disabled. No filesystem module is loaded after verification.
Each module must export exactly one asynchronous `execute` function. The
verifier creates the descriptors itself and returns privately branded, deeply
frozen evidence and handles.

## host composition

The sibling launcher verifies and loads the bundle first, then calls the
already certified `launchAdmittedSealedTypedExecutionMission` with the branded
executor handles. The existing host independently requires their descriptors
to match the externally pinned admitted policy exactly. The policy therefore
binds the same implementation-derived executor identities that the bundle
receipt certifies.

No historical host contract, fixture, runtime namespace, policy, receipt, or
default is reinterpreted. A policy that selects the bundle-backed descriptors
receives its normal distinct execution-binding namespace through the existing
host.

## failures

The new public launcher exposes closed failure classes:

- `input-invalid`
- `bundle-integrity`
- `bundle-interface`
- the existing admitted host error classes after successful bundle resolution

Changed pins, receipt fields, receipt digest, module bytes, module path,
capability set, descriptor, import statement, export surface, or policy binding
must fail before any executor invocation.

## acceptance

- caller-selected executor functions are impossible on the sibling API
- one external digest pins one canonical receipt and exact module byte set
- native verifier I/O cannot be replaced by the caller
- exact verified bytes, rather than a later filesystem read, are executed
- parsed modules expose only one async `execute` function
- receipt descriptors are authority-empty, sorted, unique, and policy-matched
- one real admitted fixture completes the Muse-to-Forge graph through the
  receipt-bound bundle
- changed receipt, module, export, descriptor, path, or policy fails before
  affected executor work
- persisted Muse recovery invokes only Forge and terminal replay invokes none
- recovery crosses a fresh Node process and does not depend on interrupted
  process-local executor state
- all earlier certified host and runner artifacts remain byte-for-byte intact
- deterministic fixture, independent Terra review, full suite, ledger, and
  release lineage reproduce from exact source commits

## proof limits

- bundle executors are deterministic certification implementations, not live
  provider or model-quality certification
- the restricted Node VM context is not an operating-system sandbox
- receipt-certified executor behavior remains trusted inside that process
- hostile same-user filesystem replacement races and hard-link identity are
  not certified
- hostile mutation of already executing process memory is not certified
- executor return before durable publication may still repeat after process death
- external exactly-once effects and general executor idempotency remain unproved
- no default adoption, CLI, provider transport, Realm action, continuity write,
  evolution, Inspiration, Lunari, or Soul activation is added
