# cross-repository current-head certificate v2 design

## purpose

The v1 cross-repository certificates remain historical artifacts. After the
portable phase-host conformance release merged, a new certificate is required
to describe the actual Godagents and Godskills heads without reinterpreting
older bytes.

v2 binds:

- Godagents `main` and `origin/main` at the reconciled current commit;
- Godskills `main` and `origin/main` at the reconciled current commit;
- the expanded SDK root export set and the supported portable adapter
  protocol;
- the certified portable phase-host receipt, its source commit, fixture
  digest, and file digest;
- the existing canonical and adaptive Godskills release inputs;
- the exact boundary evidence and fresh test-run projections.

The verifier reads source evidence from exact Git blobs and requires strict
current refs for v2 issuance. A portable receipt source must be an ancestor of
the bound Godagents head. The existing v1 and issuance-snapshot verifier paths
retain their original export set, evidence set, proof limits, and historical
head semantics.

## security and authority boundary

This is an evidence and migration certificate, not a runtime change. It does
not execute Godskills, copy capability bodies, choose a provider or model,
grant authority, add a live Codex, Claude Code, local-model, or MCP adapter,
change default launch behavior, or integrate Lunari or Soul.

Portable conformance remains structural. The certificate proves that the
merged SDK advertises the versioned boundary and that the certified receipt is
bound into the current cross-repository evidence. It does not turn an
external host into a qualified adapter.

## compatibility

The v2 protocol and artifact are append-only. `integrations/cross-repository-
current-head-v1.json` and `integrations/cross-repository-issuance-snapshot-v1.json`
must remain byte-identical. v2 is a new certificate protocol and does not
enter the historical Godagents certification ledger.
