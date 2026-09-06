# external host qualification dossier v1 design

## context and evidence

The reconciled Godagents head is `b8354a3`. It already certifies the
provider-neutral `eternities-portable-phase-host-v1` contract and a separate
hostile-input campaign, but it explicitly does not claim that Codex, Claude
Code, a local model, MCP, or a live provider adapter exists or is qualified.
The existing host description is the right narrow transport boundary. A new
qualification layer must therefore describe evidence around that host without
turning a local fixture into a live-provider claim.

## decision

Add a standalone, provider-neutral `eternities-external-host-qualification-v1`
dossier. It is a body-free, digest-bound handoff artifact above the existing
portable phase-host description:

```text
portable host description
        |
        +--> certified conformance and hostile-input baseline digests
        |
        +--> optional live-evidence digests supplied by an external authority
        v
external host qualification dossier
```

The dossier has two honest states:

- `contract-only`: the host satisfies the local portable contract and the
  certified hostile-input baseline is bound, but no live run is claimed;
- `live-evidence-bound`: an external authority has supplied a digest-bound live
  run, security run, provider family, source commit, and all three phase result
  digests. The dossier records that evidence but does not independently assert
  provider truth, model quality, or remote exactly-once behavior.

The current release will issue only a `contract-only` dossier. A future adapter
may produce the second state after a separate live run and security receipt are
independently verified. No provider call, credential resolution, model routing,
Realm effect, identity mutation, keel or memory write occurs in this layer.

## requirements

1. The verifier must accept only the exact portable phase-host description and
   recompute its description digest before accepting the dossier.
2. The baseline must bind the exact protocol ids and receipt digests for the
   certified portable conformance and portable adversarial releases.
3. `contract-only` must carry `liveEvidence: null`; `live-evidence-bound` must
   carry exactly one provider-family identifier, one source commit, one live
   run digest, one security run digest, and native, review, and revision result
   digests.
4. Unknown fields, credential-shaped fields, authority-shaped additions,
   digest drift, invalid commit syntax, missing phases, and byte overflow must
   fail closed before any external dependency is called.
5. The artifact must be deterministic, deeply immutable on return, and bound by
   one canonical `dossierDigest`.
6. The package SDK must expose construction and verification explicitly without
   changing default vessel launch or provider selection.
7. The certification must prove the contract-only path, the reserved
   live-evidence shape, and hostile rejection cases while stating that no live
   host was qualified.

## data ownership and trust boundaries

- `src/sdk/portable-phase-host.mjs` owns the portable host description and its
  authority-empty phase contract.
- `src/host/external-host-qualification.mjs` owns only dossier validation and
  digest binding. It owns no host callable, credential, provider response,
  Realm handle, identity, continuity, or scheduler state.
- The certification fixture owns deterministic evidence-shaped values only.
- An external authority owns the truth of any future live-run and security
  receipts. Godagents may bind their digests, but cannot manufacture or
  authenticate that authority here.
- The dossier is a migration boundary, not an identity change. Replacing a
  compatible host release requires a new dossier; it never mutates an agent,
  keel, Godskills release, or mission authority envelope.

## options considered

### extend the portable host description

Rejected. The description is a stable transport contract and adding historical
receipt lineage or live-run claims would make every host description provider
and release specific.

### build a concrete Codex or provider adapter now

Rejected for this milestone. No current evidence or explicit live-host
authority is available, and a deterministic local fixture would not qualify a
remote host.

### add a standalone qualification dossier

Selected. It gives future Codex, Claude Code, local-model, and MCP adapters one
stable admission vocabulary while preserving the existing host contract and
making the missing live proof visible rather than implicit.

## proof boundary

The source-bound certificate proves canonical dossier construction, exact
baseline binding, reserved live-evidence validation, credential and authority
rejection, digest and phase drift rejection, byte bounds, and SDK exposure. It
does not prove live provider quality, model equivalence, remote exactly-once
execution, external signer truth, hosted durability, or a qualified Codex,
Claude Code, local-model, or MCP adapter.

## reconsideration trigger

When one concrete external host and its independently verifiable live and
security receipts are available, add a separate adapter-specific qualification
receipt. Do not widen this provider-neutral dossier or mark the current
contract-only certificate as live qualification.
