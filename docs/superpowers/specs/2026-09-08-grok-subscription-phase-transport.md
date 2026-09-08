# Grok subscription phase transport

## Outcome and scope

Add a real subprocess transport for native, review, and revision phases. Reuse
the provider-neutral phase contracts, durable operation engine, and portable
host. Do not emulate HTTP, duplicate the runtime, change identity or authority,
or treat compatibility as proof of model quality.

Use the already-owned Perseus bridge and vendor Grok CLI, each pinned by SHA256.
Subscription OAuth only. No OpenRouter, direct paid xAI fallback, hidden retry,
automatic model replacement, or native conversation continuation. The bridge
is a trusted host dependency, not a sandbox for arbitrary acquired code.

## Boundary

An externally pinned, bounded canonical policy names the exact model, bridge,
binary, auth reference, usage profile, timeout, request/response ceilings, and
phase budgets. Credentials remain opaque capabilities outside receipts. Check
pins at dispatch, isolate the native invocation, remove native tools including
MCP discovery/invocation, and clean only the bridge-owned temporary root.

Compile the selected neutral phase input and output schema into a prompt.
Request native JSON terminal output but do not enable `--json-schema` and its
additional correction behavior. Locally validate content against the existing
phase contract. A definite invalid response is terminal; uncertain process
failure remains pending and requires existing signed recovery, never redispatch.

## Accounting and evidence

Pin `grok-headless-additive-v1`: uncached input + cache reads + cache writes +
output = total. Preserve reported values. If cache-write count alone is absent,
derive its nonnegative residual from the reported total and label the derivation.
Never manufacture missing reads, reasoning, output, or input as zero. Reject
incomplete or contradictory token telemetry, unrequested model rows, extra
recorded rounds, and completion budget violations. `num_turns` and `modelCalls`
describe the reported ledger, not physical exactly-once inference.

Keep provider-reported cost optional and distinguish it from actual charges.
The raw evidence is the closed accounting projection, not the whole provider
envelope or hidden reasoning. Unknown usage/model-row fields reject rather than
disappear. Model attribution explicitly distinguishes the required matching
per-model ledger from an additionally reported top-level model, which the
documented native JSON output may omit.
The installed binary is vendor-signed and byte-pinned; its exact correspondence
to public source is unverified. Public field semantics are supported by
`xai-org/grok-build` commit `72a61251fcffb464bcc687aeb5a998e5a98ec0c9`,
headless guide section "json", captured in the existing Grok research receipt.

## Completion gate

Red/green protocol and policy tests, real local subprocess integration through
all three phase ports, secret/pin/failure/replay adversaries, independent review,
then merged regression gates. A separate bounded live certification and matched
evaluation preregistration are required before quality claims. No Soul or
Lunari activation and no new provider spending authorization in this batch.
