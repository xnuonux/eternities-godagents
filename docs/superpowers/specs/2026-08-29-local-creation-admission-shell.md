# Local Creation Admission Shell

## Boundary

The local admission shell composes existing verified boundaries into the first complete frozen lifecycle:

```text
verified creation build + pinned prompt and Realm inputs
  -> verified local distribution snapshot
  -> deterministic transactional genesis
  -> admitted local record and isolated keel
```

It is an operator shell, not a new compiler or authority boundary. It does not start a vessel, call a model, load host policy, invoke a Realm hand, evolve an agent, activate Inspiration, integrate Lunari, or activate Soul.

## Contract

`admitLocalCreation` accepts one verified creation directory, independent policy and creation-build pins, one Prompt OS artifact, one Realm contract, one dedicated workspace, a closed instance identifier, a creator reference, and one checkpoint purpose.

Before any workspace write it verifies the creator build, snapshots the six exact creation artifacts and the two supplied local inputs in an OS temporary root, compiles and verifies a distribution there, requires the Realm capability set to equal the genome requirement set, and derives the deterministic genesis identity.

The workspace is dedicated to one admission. The shell atomically publishes an `admission` snapshot containing the verified creation, distribution, and canonical binding. Every transaction, journal, snapshot, and local keel path is then derived beneath that snapshot. Existing state is accepted only when the binding and verified artifacts are exact. Changed creation, prompt, Realm, instance, creator, or checkpoint input is refused.

Transactional genesis retains its own crash-safe, exact-idempotent recovery. The shell returns only a bounded canonical projection containing creation and distribution build IDs, genesis and keel IDs, and the admission receipt digest.

## Safety invariants

- source pin or compatibility failure occurs before workspace creation;
- caller-controlled output subpaths do not exist;
- unexpected workspace entries, symbolic links, reparse points, and binding mismatches fail closed;
- a published snapshot is immutable input to genesis;
- only the local reference keel backend is available;
- successful admission creates no runnable vessel and performs no external effect;
- evolution remains `frozen-v0` and Soul remains `dormant`.
