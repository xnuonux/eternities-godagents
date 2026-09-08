# Comparison provider candidates

Dom requested MiniMax and Grok 4.6 as distinct comparison candidates. Compare
native versus Godagent within each model first. Do not confuse a weaker or
stronger model's baseline with the contribution of the agent architecture.

## Verified route evidence

Read-only coordination with the Perseus task
`019f3dd3-d48d-7033-8517-e9358b16ea4f`, followed by local source/document checks:

- `C:/dev/perseus-v2/perseus-grok-cli.js` implements a native subscription CLI
  subprocess route, identified internally as `grok-cli://subscription/v1`.
  That identifier is not an HTTP endpoint.
- Native model `grok-4.6`, alias `x-ai/grok-4.6`; the route uses prompt files,
  JSON output and an empty native tool allowlist. Host tools remain separately
  governed.
- `C:/dev/perseus-v2/docs/evidence/grok-engineer-2026-09-06.md` records historical
  successful live subscription runs. It explicitly distinguishes subscription
  usage counters from additional API billing.
- The owning task reports a separate paid direct xAI route. Do not use it as a
  fallback for this subscription request. No Grok-through-ClovAPI HTTP route has
  been verified in this investigation.

At initial inspection, authentication freshness, subscription headroom and live
availability were unverified. A subsequent bounded native probe refreshed the
existing login and obtained one compatible response. See
[the subscription probe receipt](2026-09-08-grok-subscription-readiness.md).
Headroom remains unverified; this does not qualify the Godagent adapter or the
two-arm comparison. The probe read the existing credential only through the
native bridge and did not expose credential values.

## Integration implications

The current first comparison adapter is OpenAI-compatible HTTP with explicit
reasoning-split semantics. MiniMax remains its candidate; the Grok CLI is not
compatible merely by changing the URL. A separate bounded subprocess adapter
must preserve exact model selection, disabled native tools, usage accounting,
failure evidence and no paid fallback before Grok can join the same evaluation.

Use matched limits within each model's two-arm comparison, with sufficient
reasoning capacity. Across different models, report reasoning, visible output,
cached input, completion totals, physical calls, elapsed time and known costs
separately. An identical small completion cap across models is not proof of a
fair comparison. Subscription access is not proof of unlimited quota.

The scheduling oracle introduced with this work is development infrastructure,
not new held-out evidence or a broad measure of agent usefulness.
