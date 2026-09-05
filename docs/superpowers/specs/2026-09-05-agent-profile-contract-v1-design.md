# Godagent profile contract v1

Status: approved bounded design

## purpose

The creation genome already carries `all-rounder` and `specialist` Godskills
fields, but their meaning is distributed between creation validation and the
Godskills adapter. This milestone makes the profile semantics one explicit,
provider-neutral contract without copying a Godskills manifest or changing the
Godskills release boundary.

The contract governs profile policy only. It does not select a provider,
load a skill body, grant authority, or replace the certified Godskills router.

## contract

The protocol id is `eternities-godagent-profile-v1`.

The policy projection contains:

- `profile`: `all-rounder` or `specialist`
- sorted unique `preferredFamilies`
- sorted unique `prohibitedFamilies`
- sorted unique `prohibitedCapabilities`
- `maxComposition` between one and three

The evaluation input is an opaque catalog projection containing only unique
capability `id` and `family` strings. It is metadata, not a skill body. The
result contains the canonical profile policy, catalog and policy digests,
eligible ids, prohibited ids, preferred ids, and explicit semantic flags.

## semantics

An all-rounder is eligible for every row in the supplied catalog by default.
Any legacy `preferredFamilies` values on an all-rounder are inert and never
become a routing preference. Explicit `prohibitedFamilies` or
`prohibitedCapabilities` remain real prohibitions, so a deliberate ceiling can
narrow either profile without pretending that the all-rounder is still
complete.

A specialist may prefer families and may explicitly prohibit families or
capability ids. Preference is never a prohibition: every catalog row outside
the explicit prohibition set remains eligible. A preferred family that is also
prohibited is contradictory and fails closed. A prohibited capability in a
preferred family is simply absent from the preferred eligible set.

The contract does not judge intelligence, quality, or model capability. It
only preserves the complete catalog outside explicit specialist prohibitions.
Host authority, effects, preconditions, risk, evidence, context, composition
ceilings, release identity, and routing remain governed by their existing
host and Godskills contracts.

## invariants

1. Unknown fields, malformed identifiers, duplicate rows, duplicate policy
   entries, unknown families, and unknown prohibited capability ids fail
   closed.
2. All-rounder evaluation returns every catalog id and no preferred id when no
   explicit prohibition is present. Explicit prohibitions are honored for both
   profile kinds.
3. Specialist evaluation removes only explicitly prohibited family or id rows.
   Non-preferred rows remain eligible and are marked as preserved outside
   prohibition.
4. The result is canonical, deeply immutable, deterministic, and digest-bound.
5. The contract reads no source bodies, credentials, paths, providers,
   adapters, Realm handles, keel content, memory content, identity, evolution,
   Soul, Inspiration, or Lunari state.
6. Existing Godskills routing receives the same eligibility shape and remains
   responsible for release verification, selection, activation, and package
   construction.

## integration boundary

Creation validation consumes the contract so an invalid profile cannot enter a
genome. The Godskills eligibility compiler consumes the same semantics over its
already verified body-free manifest projection. No Godskills files or source
bodies are copied, and no profile digest becomes a substitute for the
Godskills release digest.

## proof limits

The proof certifies deterministic policy semantics and preservation of
non-prohibited specialist capabilities over a local metadata fixture. It does
not certify specialist quality, unseen routing quality, provider equivalence,
live host adoption, model selection, or product usability.

## non-goals

- no new Godskills capability or manifest
- no skill-body loading or routing change
- no authority, Realm, continuity, keel, memory, identity, evolution, Soul,
  Inspiration, or Lunari behavior
- no live provider or model evaluation
- no automatic profile recommendation or user-interface work
