# Explicit workspace admission boundary

Source basis: main901e4f7, browser runtime333fd1f. This is the admission portion
of the actor-workspace vertical slice, not an execution host or product release.
Standing scope is provider-neutral Godagents development with preserved old
permissions, no new spending, Soul or Lunari activation. Work remains inline on
a feature branch; the unrelated untracked package-lock.json is preserved.

## Decision and alternatives

Add `local-workspace-v3` to the existing distribution compatibility verifier and
project its exact limits into the existing inert cortex envelope. Fresh creation
and local admission must bind the matching capability set. Old artifact and
counter hosts must reject this profile. Compiling a capability declaration does
not issue permission or a runnable owner.

Expanding the artifact profile in place would silently widen existing admissions.
Cloning the numeric consequence host would import the wrong outcomes and duplicate
recovery. An additive profile plus the existing identity/admission/mission seams
preserves those boundaries. Revisit if implementation starts inventing a second
identity, scheduler or provider journal. Existing actors are not migrated.

## Closed Realm contract

Top-level fields: schemaVersion3, profile`local-workspace-v3`, realmId, version
`1.0.0`, trustModel`operator-local`, capabilities, artifactStore, workspace, privacy.
realmId retains the existing lowercase identifier syntax/128-character ceiling.
Capabilities are exactly the five unique values artifact.publish, artifact.verify,
workspace.revise, workspace.test, workspace.export. Host capture is preparation,
not an agent permission to scan arbitrary source directories.

artifactStore retains the exact local-artifact-v2 store shape and semantics:
operation publish-local-artifact, the first-party publication producer digest,
relativeRoot artifacts, maximumBytes1..16777216, sha256-canonical-json naming,
exclusive-hard-link publication and verify-identical-canonical-json replay.
This authorizes only the declared proposal-publication capability, not operations
encoded inside a model's artifact. Reuse its verifier semantics, never relabel
workspace input as artifact input for dispatch.

workspace has exactly relativeRoot`workspace-revisions`, maximumFiles1..16,
maximumRevisionBytes1..4194304, browserProfile`host-reviewed-browser-local-v1`,
independentReviewRequired:true and sourceMutation:false. These upper bounds come
from the qualified browser runner. Host store/runner/mission limits may be lower,
never higher. Exact file selection, run counts/deadlines, reviewed child digests,
suite/runtime pins, operation records and export destinations belong to the future
issued owner, not a model-created Realm declaration.

privacy remains retention`operator-managed`, automaticDeletion:false. Unknown
fields, unsupported versions/profiles, duplicate/extra/missing capabilities,
incorrect producer, weakened review/source-mutation flags, aliases in fixed roots
and noninteger/out-of-range limits reject.

## Real caller path and projection

compileDistribution/loadVerifiedDistribution retain container schema1 and bind
exact Realm bytes in the distribution identity. admitLocalCreation still requires
the creation's capability set to equal the supplied Realm set. The existing
genesis verification must authenticate that snapshot before cortex compilation.

The inert authority.resourceLimits projection is exactly:
{profile:'local-workspace-v3',maximumArtifactBytes,maximumFiles,
maximumRevisionBytes,browserProfile:'host-reviewed-browser-local-v1',
independentReviewRequired:true,sourceMutation:false}.
The cortex identity-envelope schema gains this third closed branch. Its state
remains inert, grantedEffects remains empty and activation requirements unchanged.
Do not overload the old artifact shape or erase workspace limits in fallback.

## Acceptance and rollout

1. An actual fresh compileCreation -> admitLocalCreation -> verified genesis ->
   compileCortexBindingCandidate path preserves identity and exact workspace limits.
   Existing fixture/artifact behavior and manifest identities remain unchanged.
2. Contract invalidity and capability mismatch reject through production callers,
   not merely a helper. A changed Realm after admission rejects on re-verification.
3. The legacy counter host cannot create state from this contract, and the existing
   artifact binding/owner cannot accept it. No provider/browser call is needed for
   this admission qualification; no source revision or execution is claimed.
4. A descriptor-valid workspace envelope remains inert with no granted effects.
   Mutation/omission of required projected limits is rejected by normal verification.

This slice is a prerequisite, not a replacement for the real issued-owner path.
Next comes exact-child review, actor/mission-bound revise/test, interruption
recovery, bounded feedback and checked diff export. Preserve the Godskills-owner
fairness requirements for the eventual fresh comparison, including equal tools,
review/feedback and baseline persistence. No new quality claim follows here.

Rollback means not issuing a workspace host. Existing admissions are unchanged;
do not delete or rewrite historical identities or receipts. Older software rejects
the new profile rather than silently treating it as an old permission set.
