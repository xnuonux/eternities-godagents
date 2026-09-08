# Effect-only SDK launch

This explicit v2 entrypoint launches an already admitted identity through an
already issued provider or portable host. It does not create an identity, choose
a model, resolve credentials, approve a policy, or construct skill-review
executors. Existing v1 launcher factories remain unchanged.

```js
import { createAdmittedEffectOnlyIdentityLauncher } from '@eternities/godagents';

// issuedHost, admissionRoot, policyPath, approvedPolicyDigest, request and
// registryRoot come from the operator's existing host/admission setup.
const launcher = createAdmittedEffectOnlyIdentityLauncher({
  host: issuedHost,
  hostKind: 'provider', // use 'portable' for an issued portable host adapter
});

const result = await launcher.launch({
  admissionRoot,
  policyPath,
  identityPolicyDigest: approvedPolicyDigest,
  request,
  registryRoot,
});
```

This is a wiring example, not a standalone provisioning script. The package is
currently private and experimental; the import works in the repository/package
environment. No installation from a public registry is implied.

## Prerequisites and boundaries

- The host must be issued by `createProviderPhaseHost` or
  `createPortablePhaseHostAdapter`, matching `hostKind`. A copied or structurally
  similar object is not accepted. Host provisioning still supplies the existing
  native/review/revision ports; this launcher consumes only native.
- `request` must be a complete schema-v2, `routeMode: 'effect-only'` request,
  including the structured producer declaration. It is not arbitrary text or a
  v1 request with a renamed schema field. The authenticated host validates its
  identity, authority, mission binding and budgets.
- `policyPath` must contain the externally approved identity-host policy v2.
  `identityPolicyDigest` is its exact lowercase SHA-256 pin. Do not calculate a
  new pin merely to make changed policy bytes pass. Policy adoption remains an
  explicit host decision.
- The v2 policy pins the routing executable, verifier, shared source closure,
  structured producer and native transport. See the
  [migration decision](effect-only-vessel-migration-decision.md). The referenced
  Godskills feature is not automatically promoted to a main-branch release.
- The admitted identity and registry must already exist. Credential screening
  runs before admission work; credentials belong to the issued host, not the
  request or launch options.
- `clock`, `checkpoint`, and `lockOptions` remain host-owned optional execution
  controls. The launcher does not accept replacement transports, review
  executors, environment objects, policy authorship or additional authority.

`describe()` returns informational copies, not an authorization or certification
receipt. The launcher is frozen; editing a returned description grants nothing.

## Outcomes and recovery

The result is the existing authenticated host result, not a new output format.
Do not treat `pending` or a routing decision as a completed artifact. Resume with
the same admitted identity, request, approved policy and journal locations.
Persisted replay verifies existing evidence and does not repeat completed native
work. Uncertain dispatch is not authorization for an automatic retry.

## Proof and remaining work

The focused tests exercise both provider families' credential rejection before
dispatch, issued portable/provider validation, and successful authenticated v2
execution/replay through a controlled portable host and both registered provider
hosts, using the pinned Godskills processes. Provider tests exercise real host
and transport implementations with controlled HTTP responses: an unauthorized
write causes zero HTTP calls, an authorized native artifact causes one, and
persisted replay causes no additional calls. These are offline tests, not live
provider qualification or model-quality evidence. No API credits are consumed.

The local-artifact CLI preparation and retrieval flow still targets v1. A full
v2 operator workflow remains the next migration work. This SDK entrypoint alone
does not complete that work.
