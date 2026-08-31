# sealed local Godskills transport v1 implementation plan

## goal

Consume the exact pushed Godskills routing executable through a scrubbed,
bounded, content-addressed local transport and compose it with recoverable
Godskills admission without changing any historical runtime path.

## task 1: freeze the routing sidecar verifier

- add a standalone routing-executable pin schema and pinned-release helper;
- add failing tests for the exact canonical receipt, closure, modes, routing
  artifacts, parents, original digest algorithms, entrypoint, and provenance
  brand;
- prove receipt, module, artifact, parent, sidecar, and alias mutations fail;
- implement a verifier layered after the historical release verifier.

## task 2: freeze the durable local process contract

- add failing tests for descriptor identity, environment scrubbing, fixed mode,
  timeout, byte ceilings, prelaunch records, regular output, and exact paths;
- add a content-addressed transport with one lock and terminal directory per
  dispatch digest;
- run the actual Godskills default and activation entrypoints;
- interrupt after child result publication and prove reconstruction commits the
  same result without another launch.

## task 3: compose recoverable admission

- add an opt-in `createLocalRecoverableGodskillsAdapter` constructor;
- verify the release and routing sidecar once through a shared trusted cache;
- require the exact activation trust root;
- derive fixed default or specialist route mode from the verified release;
- build route and activation terminal transports beneath the admission root;
- delegate binding, rehydration, collision, and replay to the existing
  recoverable adapter;
- prove terminal binding replay performs no process work.

## task 4: certify and integrate

- create one deterministic end-to-end crash-and-recovery fixture;
- create an append-only receipt and human certification record;
- verify every historical receipt and release-lineage edge;
- run focused and full suites;
- perform inline adversarial review under the user's no-subagent constraint;
- reconcile upstream, fast-forward main, push, verify origin, and remove the
  feature worktree.

## task 5: reassess the next product migration

After certification, compare the admitted host, local CLI, and identity-bound
vessel boundaries. Select the smallest surface whose migration can preserve
its prior receipt while making this transport the explicit new default. Do not
silently rewrite an older runtime or infer live-provider readiness.
