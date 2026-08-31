# Deferred Godskills review materializer v1 certification

## certified source

The post-native, provider-neutral Godskills review materializer is frozen at
source commit `7dbc2ccfea8a7f0aebdd99bae574d6910828211f`.

- certification receipt: `receipts/deferred-godskills-review-materializer-v1.json`
- receipt digest: `d7dc62f235e76672e63675aa1a2e69c558d32339adb2a1483b8db01b65cb5179`
- receipt file SHA-256: `243a252f47a9d9d63a520a2d6a673acd045515c8de29b5e2a5b594e136a8ccac`
- deterministic fixture: `fixtures/deferred-godskills-review-materializer-v1.json`
- fixture logical digest: `a863485f9aa5df3a446f75db25aa35d5732bae744fa56cbe464f565b159cc804`
- fixture file SHA-256: `35600e0c74f2373683b624df433210a2f8d8fa7a3ef365333ad04144d1456f0d`
- implementation manifest digest: `0d86c1355ee48cfdfbf3f7dcd04f0b3686eacb24d2c4db6b07e230b56bf453fa`
- test manifest digest: `bdf80e4c038ac84755b049607ff7417db48a4b3a88bcc1d45e8a323a19e62b00`

## pinned Godskills dependency

- Godskills commit: `3a63c07322808b6958593bd765c0fb32023a2da5`
- verified release digest: `c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f`
- activation trust root: `c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7`
- selected `eternities-aegis` entrypoint SHA-256: `91b2029f6866272d30e3d685dce32700e910889830133e107a9009eb2269c8b7`
- selected `eternities-aegis` contract SHA-256: `7c415193c5de8816822f302ab0733816ffc01f8de19c2ba8698e4e604cf8a198`

## verified behavior

Construction verifies the complete pinned Godskills release and activation
root without opening the selected review entrypoint or contract. Materialization
first validates the exact mission admission, review request, executor
descriptor, round, subject, prior review, release identity, activation root, and
the complete deferred capability set. Only after that preflight succeeds are
the selected bodies opened and hash checked.

Round one binds one exact native artifact and no prior review. Round two binds
one exact revision, its exact first review, and the native artifact digest
carried through both. The returned package binds the mission, admission,
request, descriptor, completion ceiling, Godskills cycle, activation root,
selected body hashes, subject, prior review, and a zero-authority projection.
Unknown fields, stale descriptors, body drift, authority-shaped artifacts,
oversized context, and post-materialization mutation fail closed.

The entrypoint and contract remain exact UTF-8 source bodies. The contract is
parsed and identity checked but is not duplicated as a second object in the
package. That reduced the deterministic round-one package from approximately
19.8 KB to 14.9 KB and the round-two package from approximately 20.5 KB to
15.6 KB while preserving exact source hashes and complete package verification.

Inline adversarial review found and fixed three trust-boundary defects before
release. First, a later invalid deferred descriptor could previously be found
after an earlier valid body had opened; the complete set is now prevalidated.
Second, a caller-owned artifact cache could preload a forged release object or
mutate a returned capability map; trusted cache state is now verifier-owned and
callers receive defensive map copies. Third, an oversized prior-review artifact
is now checked against the admitted artifact ceiling before disclosure.

## verification

- all 9 `DRM` requirement rows passed
- 85 focused integration tests passed
- 507 full repository tests passed with zero failures and zero skips
- two fixture builds reproduced logical digest `a863485f9aa5df3a446f75db25aa35d5732bae744fa56cbe464f565b159cc804`
- two receipt builds reproduced receipt digest `d7dc62f235e76672e63675aa1a2e69c558d32339adb2a1483b8db01b65cb5179`
- two receipt builds reproduced file SHA-256 `243a252f47a9d9d63a520a2d6a673acd045515c8de29b5e2a5b594e136a8ccac`
- all 17 append-only certification receipts and their declared historical links verified
- certification ledger digest: `89fb4c3194a46fad2cd89bc66a2636202ce42cb959444ad782193bb6abe9b47d`
- source-head release-lineage digest before the release-only commit: `9a0afc6d1ba74d5b79746ef57769f6e057f1ea6acc6c75493daed364a7520a42`
- inline adversarial review found no unresolved critical defect
- no independent reviewer or subagent was used, as required by the user

## proof limits

This receipt certifies deterministic local materialization and exact selected
body disclosure. It does not certify a live model or provider call, review
quality improvement, arbitrary adaptive evaluator execution, standalone durable
journal commitment, a revision executor, default vessel or Codex task wiring,
provider credentials, model routing, Realm action or compensation, continuity
admission, personal-keel writes, Lunari integration, Inspiration, or Soul. The
inherited v1 Godskills release digest remains bound to the configured local
repository root.
