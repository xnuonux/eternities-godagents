# Recoverable Godskills admission v1 certification

## certified source

The provider-neutral recoverable Godskills admission boundary is frozen at
source commit `363a29184f88f168702d6eef66b7c96feb3c8202`.

- certification receipt: `receipts/recoverable-godskills-admission-v1.json`
- receipt digest: `6a83da9d38ae69c92a40c8fffd92748ecdd3577b6bf9f37e04114a49f0f9bbc0`
- receipt file SHA-256: `03323f26c6487d110a610d112bfa23e2da4c0c38cb70784794213c55bb287e50`
- deterministic fixture: `fixtures/recoverable-godskills-admission-v1.json`
- fixture logical digest: `6b7138695f908904670c272071af14fa9d9887d401b6aa4474c2b940c5fca9b1`
- fixture file SHA-256: `31feb78f8936507efdbb0417bb33cd31ed9196a56c44bfb6c9e4b9fba0f3d034`
- implementation manifest digest: `404512566303f5db80f8a6eccc1f5ebdb6f2d149bcc298463bdab16381efd504`
- test manifest digest: `d050f0f7ddadf3dc9a61fbb1d47a0d424c2731f2414bf316623fb0ff43a1165e`

## pinned identities

- Godskills commit: `3a63c07322808b6958593bd765c0fb32023a2da5`
- verified Godskills release: `c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f`
- activation trust root: `c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7`
- selected capability: `eternities-aegis`
- selected entrypoint: `91b2029f6866272d30e3d685dce32700e910889830133e107a9009eb2269c8b7`
- selected contract: `7c415193c5de8816822f302ab0733816ffc01f8de19c2ba8698e4e604cf8a198`

## verified behavior

One mission id publishes one immutable complete Godskills binding intent before
routing or activation can run. The intent binds the exact mission,
observation, genome policy, host ceiling, source epoch, and pinned release.
Changed input or release identity collides before any transport use. After the
existing Godskills adapter accepts the result, one immutable final binding
record binds the intent, release, receipt, Cortex package, and final digest.

Routing and activation each have a strict, credential-free, authority-empty
transport descriptor, dispatch, and completion. Their operation identity is
stable across reconstruction. Every possible execution follows an exact
`absent` reconciliation. `completed` recovers the exact completion, `pending`
returns a strict wait projection, and ambiguous or changed state fails without
execution. The route-window dispatch is
`3859bb87231d62b78206c5f4b034747b874a615f73914c07f84cdf24f6e0dc88`,
and its recovered completion is
`1f6c4f49d37b2524193304d261553f9772fc19127f79d9b742a4dc99ef44abf1`.

The first fixture process dies after external route completion but before local
publication. Reconstruction performs two route reconciliations and exactly one
route execution. It then performs one activation execution and publishes the
accepted binding at digest
`a4fea6b0861f4e8f9aaa48bde78283342928cf6301bb28b264a9de2fe29aa530`.

The chained vessel proof then dies after activation execution but before local
publication. Its activation dispatch is
`1da32876970f2837398b57ebd2e08fa7298c519958da370878c4e6d0af932a05`,
and reconciliation recovers completion
`b29a574262b097dcc5b36298177407b5fddfaeaeafe767e6e78237effcd8d346`
after two reconciliations and only one activation execution. The recovered
binding enters the identity-bound vessel without rerouting.

The same proof dies again after native completion. Reconstruction reproduces
identity dispatch
`b8653953cf324f49fd9a825992ebbed197214fd68c78e8e146cae761f3986888`
and model projection
`e242ab4e9c0c72364f5eb889fcdbed8c3e9635c6b150995ff965f95a5d74a104`,
then recovers native work after two reconciliations and one execution. The
actual deferred-review path performs two review executions and one revision.
Final review accepts at mission receipt
`15b6a7d4c42350d85596c0c0010c093ac4b2748bd950a7138089c851a865d12a`,
enclosed by vessel receipt
`cbdf4390c264a221ffa41398b96dda51e3b07b014261f598b26b780a77a87930`.

Exact terminal replay returns the same vessel result with zero routing,
classification, activation, native, review, or revision calls. Review mode
exposes no selected capability body before native inference. Pending admission
publishes no vessel and invokes no native cognition. Classification drift after
interrupted activation collides with the immutable dispatch before another
external call.

## verification

- all 14 `RGA` requirement rows passed
- 148 focused integration tests passed
- 585 full repository tests passed with zero failures and zero skips
- two complete fixture builds reproduced logical digest `6b7138695f908904670c272071af14fa9d9887d401b6aa4474c2b940c5fca9b1`
- two complete receipt builds reproduced digest `6a83da9d38ae69c92a40c8fffd92748ecdd3577b6bf9f37e04114a49f0f9bbc0`
- both receipt builds reproduced file SHA-256 `03323f26c6487d110a610d112bfa23e2da4c0c38cb70784794213c55bb287e50`
- route, activation, and native cognition each executed exactly once across their crash windows
- terminal replay performed zero external calls
- all 22 append-only certification receipts and declared historical links verified
- certification ledger digest: `d7e8f30fd54dcf5555116d9ae3efbe4c06a7f50d40315dbabfc03e069a21b61c`
- source-head release-lineage digest before the release-only commit: `1190007a01ce635d4949c286d81e0796d600cc3c7139cc037649c4ab42460640`
- inline adversarial review found no unresolved critical defect
- no independent reviewer or subagent was used, as required by the user

## proof limits

This receipt certifies local provider-neutral composition against injected
transports that promise truthful terminal lookup and atomic deduplication by
exact dispatch digest. It does not certify those transport implementations, a
live model or provider, routing or output quality, hostile same-user isolation,
provider credentials, model routing, a concrete OpenAI, Anthropic, Codex,
Claude Code, local-model, or MCP adapter, Realm effects or compensation,
continuity admission, personal-keel writes, Lunari integration, Inspiration, or
Soul. The inherited Godskills release remains bound to its exact configured
repository root.
