# Local Creation Admission Shell Plan

## Goal

Connect one reviewed creation build to verified local distribution and transactional genesis without widening authority or starting runtime execution.

## Tasks

1. Add failing service tests for clean admission, pre-write pin and compatibility refusal, exact workspace confinement and snapshot binding, changed-input collision, and crash-point recovery without duplicate journal or keel rows.
2. Implement `src/genesis/local-admission.mjs` as a narrow orchestrator over `verifyCreationBuild`, `compileDistribution`, `verifyGenesisInputs`, `prepareGenesis`, and the local keel backend.
3. Add a strict `admit:local` parser and CLI with one workspace root, closed output, and no caller-selected internal paths.
4. Document the operator flow and explicit non-runtime boundary; add the package command.
5. Run focused and complete no-network tests, reproduce all historical builds and receipts, request independent P0/P1/P2 review, reconcile upstream, merge, rerun merged gates, push, verify parity, and clean the owned worktree.

## Acceptance

- valid admission returns a verified receipt projection and exactly one journal and keel genesis chain;
- all source and compatibility failures leave the workspace absent;
- changed inputs cannot reuse an occupied workspace;
- every injected genesis crash resumes to one exact admission;
- CLI values and failures are canonical and bounded;
- no runtime, provider, Realm action, evolution, Inspiration, Lunari, or Soul activation surface is added.
