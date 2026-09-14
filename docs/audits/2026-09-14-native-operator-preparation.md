# Native admission-to-operator preparation

Implementation: `a54967a7a8a4b8dd0f4bda42f9ac33ba93b9dc98`.
Windows output correction and fully verified runtime:
`a2bd5a377d18a9278f73249d6613921aded6eaf4`.
Base: `fe3e103e560ae943e90912b32feb9075c80b606b`.
Merged: `d3f01f1e8f45dcd7e95b66770af7ed3fbac9b9da`.

## Delivered boundary

The public [native operator](../native-pi-operator.md) now accepts `prepare`.
An independently pinned preparation request selects an existing admission by its
`bindingDigest`, plus explicit mission, model, tool grant and host paths. The
[implementation](../../src/host/native-pi-operator.mjs) reuses the existing
admission path assembler, binding reader, genesis/cortex verification and native
effect checks. It publishes a normal version1 operator config with exclusive
creation and returns its canonical value digest. The CLI and optional native SDK
both expose the operation; neither needs a bespoke mission setup script.

Preparation does not load Pi/auth, infer, create an identity/session, select
Godskills, enable review, or increase authority. Explicit optional Godskills pins
are validated and preserved; omission remains ordinary unbound operation. Launch
and resume retain their own independent validation. Preparation is not evidence
of a live lease, available model, subscription, production Realm or product quality.

Output cannot overwrite an existing file or land inside protected roots, including
resolved directory aliases. Source mutations, wrong pins, incompatible tools and
expired grants fail before publication. A failed partial publication is preserved.
This is not a hostile-same-OS-user sandbox.

## Acceptance and release evidence

- The initial 22 preparation cases failed because the feature was absent. The
  separate public-SDK-to-real-Pi launch/resume case also failed before implementation.
- Initial focused integration: 51/51, including real native file writes and saved
  conversation/actor continuity through the generated configuration. Only the
  provider/authentication seam was scripted, not Pi's session or tools.
- An owner probe then reproduced Windows `NUL` publication returning success
  without a saved config. A new regression failed, then passed with the output-name
  guard. All 23 preparation cases pass, covering device names, alternate streams,
  normalized-away suffixes, occupancy, source pins and protected paths.
- Full corrected source gate: **1,686 passed, zero failures/cancellations, nine
  existing optional skips**, 1,695 total, at `a2bd5a3`. Installed Pi0.85.1 was enabled.
  Four-worker elapsed time: 688,994ms. All69 canonical receipts and their historical
  source lineage verified. Log SHA256:
  `1343b28d4a1ab77657281af92e054b88cbe2d594c5f23833a240eff81fa59351`.
- Merged native gate: **173/173**, no failures/cancellations/skips, 19,891ms at
  `d3f01f1`. Runtime/tests/schemas/package metadata are byte-identical to the full
  gate's source. Log SHA256:
  `95ba361a64f62cfeeb34fbb2b5eacea955cb5cedde6ebc0646285bc35b5dbd06`.
  All158 local links across the four changed documents resolved.

The earlier full run at `a54967a` was intentionally stopped after295,659ms when
the separate NUL probe established a necessary correction. Its partial exit1 log
is preserved, not represented as a green release or an assertion failure.

## Public creation walkthrough

Six actual public CLI stages passed: catalog, preview, finalization, local
admission, preparation, subscription preflight. The fresh instance was
`native-public-walkthrough-20260914`; no live identity or precompiled creation was
copied. The exact config digest was
`35ee1f3dc359e0035e834a3c16f60d83e614bf2f5facc5ae94261a76fab01b8d`.
No inference or native session was started by this walkthrough.

The first admission input incorrectly paired the creator's `godagent-v0` /
`prompt-os-v1` selection with the generic sample prompt. Admission rejected it
as `compatibility-invalid`. The existing compatible operator-library prompt
resolved the input mismatch, without runtime changes or repeating completed
creator stages. Both records remain. The catalog and Realm remain explicitly
first-party reference/fixture material, not a production catalog qualification.

## Independent review, including unsuccessful attempts

The first Grok4.6/Pi review used a sparse source copy and spent reads on missing
dependencies. Ten unchanged requested dependencies were supplied without replacing
the original files or redispatching inference. The600s deadline still interrupted
the run with no verdict. Its10 response events include one aborted/unknown-usage
event; cumulative usage and completion split remain unknown, not zero.

A complete-source replacement setup attempted to use that revoked actor. It was
rejected before inference. The stored error digest exactly matches
`CortexBindingRegistryError: revocation epoch mismatch`; the registry records
epoch0 acquisition and epoch1 revocation. No registry, identity or old session was
reset to bypass it. A fresh independently admitted read-only reviewer was created
from the same verified creation template, with a new instance/genesis.

That final review used the complete canonical repository and ordinary native
read/search tools, not a new coding loop. It returned **approve, no blocking
defects** after446,569ms,17 responses and53 completed tools, with no tool errors
or pending actions. It reviewed `a2bd5a3`, including the owner-discovered NUL fix;
it did not execute tests. Its response SHA256 is
`6a379c7eff00220e0c7e08172d96af4d7bce4d220e598333ca0fbf1ad4d7d160`.

Reported usage: input195,001; inclusive output23,432; cache read615,168; cache
write0; total833,601. Output includes21,053 reasoning tokens and2,379 other output
tokens, which may include tool arguments. These are observed counters, not a
monetary/subscription-quota calculation or a comparative quality win.

Nonblocking review notes: CLI screening collapses some Godskills errors into a
generic failure; the device-name check is not an exhaustive Windows-device
inventory; preparation authenticates through genesis rather than requiring the
older fixed six-entry admission-tree layout. The last distinction also permits
existing native registry directories. None grants authority or bypasses genesis.

## Confirmed next usability gap

[Native request construction](../../src/host/native-pi-operator.mjs) currently fixes
the revocation epoch at0. The [binding registry](../../src/host/cortex-binding-registry.mjs)
correctly requires the newer epoch after revocation. Consequently a new config
alone cannot reopen that revoked actor, and the generic CLI error hides the exact
reason. This is an existing recovery limitation, not silently fixed by preparation.
The next bounded design should provide explicit host-authorized recovery with
actionable diagnostics, preserving identity/evidence and never auto-clearing
revocation or repeating uncertain effects.

## Evidence location and exclusions

Private evidence:
`D:/00-INDEX/operations/2026-09-14-native-operator-preparation`.
Retain the original and corrected full-release logs/results, Windows probe,
public-walkthrough outputs, review snapshots/manifests, all three setup/run
records, native sessions and exact review response. These are local operational
evidence, not portable new certification receipts. `package-lock.json` remains
user-owned and unchanged.

No Godskills release/root, model default, personal Grok keel, Soul, Inspiration
or Lunari integration changed. This milestone closes manual admission-path
assembly, not every creation UX, native Realm, recovery or portability gap.
