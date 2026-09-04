# cross-repository current-head certificate v1

> **historical note:** this document describes the preserved v1 issuance
> artifact. the active contract is the explicit issuance-time snapshot in
> `2026-09-03-cross-repository-issuance-snapshot-v1-design.md`; it keeps the
> strict staging check but does not require moving refs to remain at the
> source after publication.

- **status:** architecture ready for implementation
- **recorded:** 2026-09-03
- **implementation repository:** `C:\dev\eternities-godagents`
- **external dependency:** `C:\dev\eternities-godskills`
- **protocol:** `eternities-godagents-cross-repository-current-head-certificate-v1`

## decision

Godagents will publish one bounded, separately verifiable integration
certificate for the exact Godagents and Godskills heads that were reconciled
before the integration batch. The certificate is an integration artifact, not
a replacement for either repository's own release ledger. Existing historical
receipts remain byte-for-byte untouched.

The certificate binds:

1. the exact Godagents commit and its remote main identity;
2. the exact Godskills commit and its remote main identity;
3. the portable Godagents SDK package export map, root implementation, and
   closed export names at the bound Godagents commit;
4. the frozen historical Godskills Beacon snapshot, including its historical
   release receipt digest and pinned source commit;
5. the exact release pin supplied by the canonical Godagents host fixture,
   including the system, router, compiler, portable receipt, and manifest
   references consumed by the current adapter;
6. the optional adaptive activation trust root accepted by the current
   adapter, without turning optional support into implicit activation; and
7. source and test evidence for the authority-narrowing and no-implicit-
   activation boundaries.

The certificate does not copy Godskills bodies or claim that either repository
has live provider quality, universal routing quality, or a production-ready
Lunari integration.

## verification contract

`verifyCrossRepositoryCurrentHeadCertificate` must fail closed when:

- either bound commit is not a full commit id or does not resolve;
- an expected `main` reference does not resolve to the bound commit when that
  check is requested;
- any bound Godagents or Godskills file digest changes;
- the Beacon snapshot is not a frozen historical snapshot, its receipt or
  source commit changes, or its source commit is not an ancestor of the bound
  Godskills head;
- the host release pin differs from the certificate, has an unsupported
  protocol, or any pinned trust-root artifact differs;
- the SDK export map or root export set changes;
- the evidence files, proof limits, or test-run records are malformed; or
- a certificate digest is recomputed from different bytes.

The verifier reads Git blobs and ordinary files for evidence only. It never
executes code from the external repository.

## exact source boundary

The current host-facing Godskills input is the `runtime.godskillsRelease`
object in `fixtures/host-policy.json`. Its `repositoryRoot` is a host path and
is recorded separately from the portable pin digest. The adapter's optional
adaptive activation root is bound as a tested accepted input, but the
canonical host fixture does not activate it.

The certificate records the exact artifact rows rather than embedding their
contents. The rows are sorted, unique, repository-relative, and digest-bound.
The selected capability body remains outside the certificate.

## evidence boundary

The certificate may record these claims only as bounded evidence:

- the SDK root is closed and experimental;
- adaptive activation requires the verified root, classifier, and transport,
  and legacy operation remains available without that complete tuple;
- the mission binder intersects authority, effect, precondition, risk,
  evidence, context, and composition ceilings; and
- existing integration metrics report zero authority expansion and zero
  unselected body loads.

These are source-and-test-backed boundary claims, not proof of model behavior
on arbitrary missions.

## non-goals

- no edits to `C:\dev\eternities-godskills`;
- no merging or vendoring of the two repositories;
- no copying of skill bodies, cold-quarry data, or third-party source;
- no change to the Godagents runtime order or adapter behavior;
- no implicit adaptive activation;
- no authority, effect, credential, identity, continuity, evolution, Soul,
  Inspiration, or Lunari expansion;
- no update of historical certification receipts;
- no claim of currentness for a future commit after either head moves; and
- no live network or provider call in the certificate gate.

## acceptance

1. A canonical certificate verifies against the exact reconciled heads and
   all declared file bytes.
2. Tampering with either commit, SDK surface, Beacon snapshot, release pin,
   activation root, evidence row, proof limit, or outer digest fails closed.
3. A different current head is rejected when exact-head verification is
   requested, rather than silently being treated as compatible.
4. The certificate is independent of the existing Godagents certification
   ledger and historical receipts remain byte-identical.
5. A build gate runs the bounded focused tests in both repositories and records
   their results without executing any Godskills body through the verifier.
