# Godagent profile contract v1 implementation plan

## goal

Create one provider-neutral, digest-bound profile contract and use it at the
two existing profile boundaries: creation validation and body-free Godskills
eligibility compilation. Preserve all current output shapes for valid fixtures.

## task 1: define the contract and schema

- add `schemas/godagent-profile.schema.json`
- add `src/agent/profile.mjs`
- register the schema with the local validator
- expose canonical normalization and catalog evaluation functions

acceptance:

- strict keys, identifier limits, sorted uniqueness, and digest identity are
  enforced
- all-rounder and specialist semantics are explicit and immutable

## task 2: write failing tests first

- add a deterministic profile fixture
- add focused tests for all-rounder completeness, inert stale preferences,
  authoritative explicit prohibitions, specialist preservation,
  contradictions, malformed catalogs, and digest stability
- add integration assertions through creation compatibility and Godskills
  eligibility

acceptance:

- tests fail before the contract exists
- no existing valid fixture changes

## task 3: integrate the smallest shared semantics

- make creation validation consume the profile contract
- make `compileCapabilityEligibility` consume the same evaluator
- preserve its existing return fields and Godskills routing responsibilities
- keep all-rounder preferences inert, honor explicit prohibitions for either
  profile, and reject specialist preference/prohibition contradictions before
  routing

acceptance:

- existing creation and Godskills tests remain green
- no source body, provider, authority, or release behavior changes

## task 4: certify and bind the release

- add a fixture builder and source-bound certification receipt
- register the receipt in the append-only ledger and release lineage
- update README and architecture with exact proof limits
- refresh the current-head certificate only after merge and reconciled refs

acceptance:

- focused, full, ledger, lineage, and current-head gates pass
- the receipt records the actual implementation commit and test counts
- Godskills remains unchanged and no unrelated main-worktree file is touched
