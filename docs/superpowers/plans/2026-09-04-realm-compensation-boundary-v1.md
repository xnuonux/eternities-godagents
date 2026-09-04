# implementation plan: Realm compensation boundary v1

## goal

implement and certify the smallest explicit compensation lifecycle without
changing the default vessel, the existing consequence host, or any Godskills
body or receipt.

## steps

1. add the optional `operation` field to the observation-delta hand rule,
   defaulting to `add` for every historical contract, and extend the fixture
   Realm's deterministic transition to honor `subtract`.
2. add a strict compensation relation verifier that binds two declared hands,
   exact payload fields, equal values, opposite operations, and one contract
   digest. It must reject extra fields, mismatched hands, unequal values,
   unsupported operations, and authority-shaped data before Realm use.
3. add a branded recoverable compensation host with the three-event journal,
   primary-host verification, exact recovery, idempotent consequence execution,
   bounded inspection, and compact receipts. Keep the existing v1 consequence
   host's public shape unchanged.
4. add a two-hand counter fixture and test-first coverage for successful
   compensation, primary-state rejection, relation drift, authority/effect
   expansion, interruption after admission and effect, result replay, journal
   tampering, aliases, unknown entries, and credential-shaped input.
5. add a deterministic fixture builder, schema, certification receipt, and
   certification command. Bind only the new implementation, fixture, tests, and
   design/plan paths; preserve all earlier receipts byte-for-byte.
6. refresh the current-head v2 certificate from the new source commit in an
   isolated candidate clone, run the complete suite, and hand the branch to the
   coordinator only after the release gates pass.

## non-goals

- no automatic rollback or compensation of uncertain effects;
- no change to default vessel launch or the package root until the new receipt
  is independently verified;
- no live Realm connector, credentials, tools, delegation, scheduler, keel,
  memory, Godskills integration, evolution, Inspiration, Soul, or Lunari
  integration;
- no generic saga engine or arbitrary user-defined executable compensation.

