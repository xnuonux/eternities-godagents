# specialist preference adapter v1 implementation plan

## goal

complete the already-derived all-rounder and specialist policy by forwarding
specialist `preferredIds` into a separately certified Godskills preference
router without converting any preference into a prohibition.

## dependency

implementation begins only after Godskills publishes the additive
`specialist-preference-routing-v1` receipt. the adapter pins that exact receipt
and executable closure. it does not trust mutable source merely because it is
inside the configured repository root.

## invariants

- all-rounders send no preference extension;
- specialists remain eligible for every non-prohibited capability;
- preference cannot alter authority, effects, preconditions, risk, evidence,
  context, composition, or adaptive activation;
- compiler and route receipts must echo the exact eligibility-derived ids;
- legacy release pins retain current behavior;
- recovery reroutes nothing and reuses the exact committed source envelope,
  selected artifacts, preference result, stack, and package identity;
- no model-quality or specialist-superiority claim is permitted.

## work

1. extend the optional Godskills release pin with the exact preference root;
2. verify the receipt, parent identities, entrypoint, dependency closure, and
   proof boundary before enabling preference forwarding;
3. pass `eligibility.preferredIds` through the mission route context only when
   the root is verified;
4. validate exact compiler-envelope and route-receipt preference metadata;
5. bind preference root and ids into source-envelope and cycle identities;
6. preserve all-rounder, no-route, unresolved, adaptive, and legacy behavior;
7. add cross-repository fixtures proving tie resolution, stronger
   non-preferred selection, forbidden overlap rejection, tamper rejection, and
   recovery stability;
8. build a deterministic integration receipt, run focused and full suites,
   certify honestly, fast-forward, and push.

## exclusions

no profile narrowing, capability removal, activation promotion, executed
review phase, model selection, provider change, Realm authority, Lunari
integration, Soul activation, or production quality claim.
