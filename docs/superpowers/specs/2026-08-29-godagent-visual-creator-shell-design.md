# Godagent visual creator shell design

- **Status:** implementation design after the local creator CLI
- **Recorded:** 2026-08-29
- **Repository:** `C:\dev\eternities-godagents`
- **Depends on:** certified Phase 3 creator protocol and reviewed local operator workflow

## Decision

Build the first visual Godagent character creator as a loopback-only local web shell. It consumes the existing operator workflow and cannot bypass catalog validation, ordinary preset replay, preview identity, explicit review, immutable source snapshots, or the Phase 1 compiler.

The browser is presentation. The local host is transport and workspace confinement. The creator protocol remains authority.

## Visual thesis

The subject is a founder or advanced operator forging a modular Godagent. The page's single job is to let that operator choose one validated creation path, understand the resulting agent, review its exact digest, and forge a pre-genesis build.

### Palette

- **void violet** `#100b1d`: environmental depth;
- **astral slate** `#1c2448`: instrument surfaces;
- **sigil gold** `#d8b66a`: reviewed identity and decisive action;
- **aether cyan** `#7cd4d9`: compatibility and live selection;
- **parchment mist** `#eae7f2`: readable foreground;
- **covenant rose** `#e57b8c`: blocked or unsafe state.

### Type

- display: `Constantia`, then `Palatino Linotype`, used only for identity and the forge title;
- body: `Segoe UI Variable`, then `Segoe UI`, for readable controls and explanations;
- utility: `Cascadia Mono`, then `Consolas`, for digests, refs, and proof rows.

No external fonts, images, analytics, or asset requests are permitted.

### Layout

```text
┌ identity / preset rail ┐  ┌ concordance halo ┐  ┌ review ledger ┐
│ validated paths        │  │ agent name       │  │ selected refs  │
│ creator identity       │  │ radial attributes│  │ exclusions     │
│ preview action         │  │ compatibility    │  │ exact digest   │
└────────────────────────┘  └──────────────────┘  │ forge control  │
                                                  └────────────────┘
```

On mobile, the order becomes identity, halo, ledger. The signature element is the **concordance halo**, a radial instrument whose thirteen spokes and perimeter values are derived from the ready preview. It is not decoration: it makes the selected agent's bounded attributes legible at a glance.

The initial direction was checked against common dark AI dashboards. Glowing glass cards, neon gradient headlines, chat bubbles, and floating orb decoration were removed. Surfaces instead behave like an astronomical drafting instrument: engraved rules, measured labels, restrained depth, and one brief halo calibration animation after preview. Reduced-motion settings disable that animation.

## Local host

The host binds only to `127.0.0.1`. Each launch creates a random 256-bit session token. Static HTML loads the token from a same-origin runtime configuration script. Every API route requires the token in `x-godagent-local-session`; the host sends no permissive CORS headers and applies a self-only Content Security Policy.

The host receives the same five library inputs as the CLI plus one operator-selected workspace root. Browser requests never supply arbitrary filesystem paths. The host canonicalizes the workspace, rejects junctioned boundary components, builds inside an unpredictable atomically created staging directory, and publishes to the reviewed preview-digest path only after successful verification. Existing, escaping, or reparse-point targets fail closed.

## API

- `GET /api/catalog`: exact bounded catalog;
- `POST /api/preview-preset`: `{ preset, creator }` to bounded review projection;
- `POST /api/acknowledge-preview`: `{ preset, creator, expectedPreviewDigest }` to a one-use review confirmation;
- `POST /api/finalize-preset`: `{ preset, creator, expectedPreviewDigest, reviewConfirmation }` to verified build projection;
- fixed static assets only: `/`, `/app.css`, `/app.js`, `/runtime-config.js`.

Bodies are strict JSON, content-type checked, and byte-limited. Unknown routes, methods, fields, invalid tokens, stale digests, occupied transactions, and workflow failures return closed JSON codes without paths, source text, rejected values, or exception text.

## Review interaction

Preview is explicit. A ready preview populates the halo and review ledger. The forge control remains disabled until the operator checks a statement that names the exact visible preview digest. The host recomputes that exact ready preview before issuing a bounded one-use confirmation, and finalization consumes it. Any preset or creator change clears the acknowledgement and invalidates the displayed review.

Finalization creates a verified pre-genesis build only. It does not call genesis, create a vessel or keel, contact a model, invoke a Realm hand, evolve an agent, or activate Inspiration or Soul.

## Acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `GWEB-001` | the server binds loopback only and uses a per-launch session token | server construction and token tests |
| `GWEB-002` | every API route requires the exact session token and same-origin policy | request matrix |
| `GWEB-003` | catalog and preview are exact bounded operator-workflow projections | parity tests |
| `GWEB-004` | browser finalization cannot choose paths outside the configured workspace | path-confinement tests |
| `GWEB-005` | stale or unacknowledged preview identity cannot write | negative filesystem tests |
| `GWEB-006` | successful visual flow preserves the certified Aether build ID | end-to-end handler test |
| `GWEB-007` | static shell is responsive, keyboard-visible, reduced-motion aware, and contains no external asset dependency | asset contract and visual inspection |
| `GWEB-008` | API errors and logs expose no rejected values, paths, or exception text | canary tests |
| `GWEB-009` | historical builds and receipts remain unchanged | guarded complete suite and digest gates |

## Explicit exclusions

This slice does not implement arbitrary manual module editing, recommendation intelligence, remote hosting, accounts, multi-user persistence, analytics, genesis admission, model invocation, governed evolution, Inspiration, Lunari integration, or Soul activation.
