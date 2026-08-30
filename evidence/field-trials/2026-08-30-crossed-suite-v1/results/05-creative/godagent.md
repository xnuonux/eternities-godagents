# Godagent creation and mission surface direction

## Receipt and route

- **Bound capability:** `eternities-muse`, selected by `05-creative` under `eternities-godskills-adapter-v1`.
- **Entrypoint verification:** `SKILL.md` SHA-256 is `e9af729ad561afb811971e4180512d4a46096f2ce245520b7db0f49c36dd79f8`, matching the binding.
- **Capability-contract verification:** `references/capability-contract.json` SHA-256 is `b8fb2a01a595b2b03133a9732e352e07f3d884ad5210684b19b98a72ee5f5134`, matching the binding.
- **Dominant route:** `interface-art-direction`. It owns this mission because the unresolved work is a coherent visual and interaction system for a consequential interface, not a request for a raster asset, an implementation, or a subjective screenshot review.
- **Authority observed:** local read and local write only. This direction proposes no new authority, no new Godskill selection path, and no change to creation, finalization, admission, or runtime semantics.

## Evidence boundary

### Source inventory

| source | class | relevant evidence |
| --- | --- | --- |
| `lunari-deep-landing.html` | extracted | The existing language names a void-to-bloom red descent (`#08090e`, `#420000`, `#750000`, `#7a1528`, `#a81f38`, `#c9556b`), moon text (`#dce3f0`, `#8b93a7`, `#565d6e`), and gold (`#c9a84c`). It uses a sigil with restrained red/cyan refraction, serif display type, a dark fixed shader, progressive reveals, and a single 820 px layout collapse. WebGL already has a dark radial-gradient fallback and limits DPR to 1.5, but its animation loop is continuous and the source contains no reduced-motion override. |
| `deep-app-desktop.png`, `deep-app-mobile.png` | observed | Lunari’s working surface is an intimate, low-density room: dark oxblood atmosphere, moonlit text, a small active marker, one prominent question, handwriting-like answer text, and a grounded composer. Desktop uses a quiet left rail; mobile preserves the question, speaker identity, answer, chips, and send control without a rail. |
| `shot-luna-d.png`, `shot-luna-m.png` | observed | The cinematic carrier is a glossy, fractured black-red substrate inside gold orbital geometry. It is monumental in the desktop image and deliberately crops closer on mobile. |
| `crtref-0_3.png`, `crtref-5_0.png` | observed | CRT-like chromatic separation, scanline/pixel texture, black negative space, and sparse red/yellow/cyan accents can express technical energy. These references are materially louder and more utilitarian than the supplied Lunari surface. |
| `docs/architecture.md` | extracted | The visual creator is a replaceable, token-gated local client over deterministic creator protocol. A draft is digest-linked; preview is exactly `incomplete`, `blocked`, or `ready`; selection or identity change clears review acknowledgement; finalization requires the exact reviewed preview and has closed browser errors. The browser is not an authority boundary and does not expose mutable source paths, genesis, runtime, Realm, keel, evolution, Inspiration, or Soul. |

### Confidence and interpretation

- **High confidence, observed/extracted:** Lunari’s primary identity is not neon futurism. It is a held, cinematic dark room whose hierarchy is carried by pale type, quiet red depth, gold as a consecrating edge, and a sigil rather than by dense chrome.
- **High confidence, extracted:** A creator must expose proof and review as product content, but must not imply that the browser grants authority or that a preview is a finalized being.
- **Medium confidence, inferred:** The lunar substrate can become a single signature moment for Godagent creation if it is subordinated to the review state. The supplied stills prove visual fit, not that a heavy real-time 3D scene is necessary or affordable.
- **Medium confidence, inferred:** CRT fracture is useful as a constrained evidence/state texture, not as the base UI grammar. Making every control scanlined or chromatically split would conflict with the quieter app captures.
- **Unknown:** no live creator shell, contrast measurements, screen-reader run, keyboard trace, font-loading trace, production asset budget, or device performance trace was supplied. No accessibility or performance conformance is certified here.

## Visual thesis

**A Godagent is not assembled in a dashboard. It is called into a guarded chamber where each chosen faculty leaves a visible trace, and only a review seal permits the chamber to become a mission table.**

The resulting law is **consecrated evidence**: black space protects attention; moon text carries meaning; oxblood marks pressure and change; gold marks verified boundaries; a controlled fracture reveals computation only at the moment a state becomes consequential. Every component either preserves this law or is an explicit utility exception.

This keeps the existing mystery, sigil, cinematic depth, and living-system character while giving selection, evidence, and execution an unambiguous operational hierarchy.

## Layout hierarchy

### One shared shell

1. **Presence bar:** compact Lunari sigil and wordmark at left, current guide or Godagent identity in the center-left, and a plain-language local-session status at right. This is a room header, not an admin toolbar.
2. **Context rail on wide screens:** retain the quiet Lunari rail from the desktop capture, but show only three semantic landmarks: `creation`, `review`, and `mission`. It communicates location, never progress by color alone.
3. **Primary chamber:** one centered working column, 68 to 76 characters wide for prose and no more than two functional columns. The current irreversible or highest-attention decision owns the upper third of the viewport.
4. **Evidence shelf:** a calm, persistent lower or right-side region for draft digest, preview state, selected Godskills, and review acknowledgement. It is readable text first, with a small sigil-derived seal second.
5. **Substrate field:** the existing void-to-oxblood shader may remain behind content at low contrast. It must never be required to identify a state, read evidence, or operate a control.

### Creation chamber

The creation path has four chapters. These are an interaction sequence, not a new protocol state machine.

| chapter | user task | visual treatment | required evidence |
| --- | --- | --- | --- |
| `foundation` | choose a validated preset or begin the ordinary composition path | a single “foundation” slab, with a calm provenance line beneath it | preset/manual provenance and current draft digest |
| `constellation` | choose one expression and the nine kind-matched module references | nine small faculty rows, grouped by narrative role rather than a marketing-card grid; selected rows form a faint gold orbital ring around the central sigil | exact selection count, kind match, selected Godskills as named evidence |
| `review` | inspect the pure preview and explicitly acknowledge it | two-column desktop arrangement: candidate identity and expression at left; operational preview, digest chain, and blockers at right. On mobile it becomes one vertical evidence stack. | preview state, catalog/draft/preview digests, review acknowledgement status, closed blocker reason when present |
| `mission table` | view the already-finalized Godagent’s current mission and bounded execution state | the completed sigil becomes a quiet witness at the top edge; mission intent, available evidence, proposed action, and result are distinct rows | identity, selected Godskills, observation/proposal/decision/action/consequence labels, no implied authority beyond the supplied result |

The signature moment is the transition from a complete constellation to `ready`: the nine chosen faculty marks resolve toward the sigil, then stop. The review panel gains a thin gold boundary and the exact preview digest becomes visibly copyable. Nothing “awakens” or claims personhood. The architecture says a ready preview is still pre-finalization, and the surface must make that legible.

### Component grammar

- **Chamber slab:** near-black translucent plane, one-pixel moon-ghost border, 12 to 16 px radius at most, and 24 to 32 px internal space. It holds content or evidence, not decoration.
- **Faculty row:** semantic button or disclosure with a name, role, one-line consequence, current selection state, and a text status. A colored dot can identify a family but cannot be the only selected signal.
- **Proof line:** fixed-width or tabular digits for short digest prefixes, ordinary selectable text for the full digest, and an adjacent plain label such as “preview digest”. No fake blockchain ornament.
- **Seal action:** the only crimson-filled primary action. It appears only when an exact `ready` preview exists and the review acknowledgement is valid. The label is literal: `review and finalize`, never `bring to life`.
- **Mission ledger row:** an explicit label at the left (`observed`, `proposed`, `committed`, `result`, or `blocked`) and content at the right. The label and its icon must remain readable without color.
- **CRT texture:** permitted only inside a non-essential state marker, loading delimiter, or compact evidence stamp, at very low amplitude. It must not sit behind editable text, digest content, or errors.

## State language

The application’s factual state language comes from the architecture; the visual language below is a proposal for presenting it.

| semantic state | source status | proposed visible language | forbidden implication |
| --- | --- | --- | --- |
| draft changed | extracted behavior | “review changed” with an unfilled gold-outline seal and a sentence that acknowledgement was cleared | that a prior seal still applies |
| preview: incomplete | extracted state | muted moon text, “more selections required”, and a checklist that names missing kinds | error, corruption, or a disabled mystery button |
| preview: blocked | extracted state | restrained oxblood boundary, `blocked` heading, closed reason code/message, and the smallest corrective next step | raw exception text or a blameful red alarm panel |
| preview: ready | extracted state | moon-on-black review slab, thin gold boundary, exact digest, and a separate acknowledgement control | finalization or runtime authority |
| acknowledgement valid | proposed presentation of extracted review rule | gold seal outline changes to a filled but non-animated seal; `reviewed against this preview` remains text-visible | universal verification or legal certification |
| finalization processing/result | proposed shell state, dependent on supplied bounded result | static progress label while pending; on result, show only canonical outcome fields and a direct route to the mission table | a theatrical birth sequence, raw server detail, or success before result |
| mission: observed/proposed/committed/result | proposed presentation of architecture lifecycle | ledger rows with named evidence class and a stable timestamp/digest when supplied | that model prose is a committed effect |

Gold is therefore a boundary color, oxblood is pressure or blocked change, moon is readable fact, and the underlying void is rest. The system remains understandable in monochrome because labels, icons, and text carry every state distinction.

## Motion causality and budgets

The current must be inward and settling. Motion earns its cost only when it explains a relationship or a change in the creation/review chain.

| event | visible cause and result | tier and timing | reduced-motion equivalent |
| --- | --- | --- | --- |
| entering a chamber | user navigation or a named chapter link reveals its heading before its controls | tier 1, opacity plus 12 px translation, 180 to 240 ms | immediate appearance |
| selecting/replacing a faculty | the user changes an exact draft selection; that row resolves into the constellation and the review seal clears | tier 1, one 220 ms path/opacity change, then stillness | selection mark swaps immediately; review-changed text updates |
| ready preview | exact preview becomes ready; nine marks converge once to the sigil and the evidence shelf gains its gold boundary | tier 1, 400 to 600 ms, once per new digest | gold boundary appears with no convergence |
| blocked preview | validation returns a closed blocker | tier 1, no shake; one 140 ms oxblood border settle and focus moves to the summary | static border and focus transfer |
| review acknowledgement | user checks an exact digest-bound acknowledgement | tier 1, 160 ms seal fill | immediate seal fill |
| mission activity | a new named ledger row arrives from the bounded host result | tier 1, one top-down row reveal, 180 ms | immediate row insertion |

Do not add a new real-time 3D object to the creator. The supplied Luna substrate can be represented as a static, pre-existing crop or low-rate CSS depth field only after asset provenance is established. The existing shader is a visual atmosphere, not a required control layer; it must pause when the document is hidden, respect `prefers-reduced-motion`, and fall back to the existing static gradient if unavailable.

Proposed performance envelope, to be measured rather than assumed:

- tier 1 only for the creator and mission surfaces: semantic HTML, CSS transforms/opacity, no shader-driven state transition and no canvas required for comprehension;
- no animation longer than 600 ms except an optional ambient background with amplitude below 3 percent;
- no continuous decorative animation under reduced motion, during pending finalization, or when the tab is hidden;
- desktop interaction target: under 16.7 ms median main-thread frame work during a selection/review transition; mobile target: under 33.3 ms median; reject any implementation that misses its named target on the selected fixture without reducing effects;
- establish explicit image/font/network weight budgets before any new substrate asset is admitted. The supplied evidence does not establish an allowable byte budget.

## Accessibility and responsive contract

### Accessibility constraints

- Use native buttons, links, checkboxes, headings, tables/lists, and live-status regions as appropriate. Never make the sigil, shader, chromatic split, or animated constellation the only carrier of selection, proof, or status.
- Every faculty control exposes name, role, selected/unselected state, and any unavailable reason to assistive technology. The selected Godskills list is text, not a decorative orbital diagram.
- The keyboard order follows the visible chapter order: context, main decision, corrective summary, evidence, then action. A visible high-contrast focus ring is required on all controls, including the rail and digest-copy action.
- Place the blocker summary before the invalid control in DOM order and move focus there only after a newly returned blocked result. Announce concise closed status messages with `aria-live`; never expose raw backend exceptions.
- Test all text and non-text contrast against named targets before acceptance. The target is WCAG AA-level contrast for normal interface text and controls, but this direction does not certify legal or universal accessibility conformance.
- Preserve 200 percent zoom and 320 CSS-pixel reflow without two-dimensional scrolling except within an explicitly labeled, keyboard-operable digest/code region. Avoid low-contrast handwritten type for required proof text.
- `prefers-reduced-motion` removes ambient breathing, refraction drift, shimmer, convergence, and scroll reveal transitions. State changes remain immediate and textual.

### Responsive behavior

The existing artifact already turns its two-column landing split into one column at 820 px. Use that same visible threshold as a starting fixture, then verify the actual creator at the device widths below.

- **Wide, 1280 px and above:** context rail plus primary chamber plus evidence shelf may coexist. Do not create a third dense inspector column. The review slab is the only two-column functional view.
- **Medium, 821 to 1279 px:** compress the context rail to icon-plus-label width, keep the primary chamber dominant, and move the evidence shelf below the main decision if it would force prose below 45 characters per line.
- **Compact, 820 px and below:** remove the persistent rail in favor of a named `creation / review / mission` drawer. The one-question, one-response hierarchy seen in the mobile capture wins over desktop parity. Chapters stack; the evidence shelf becomes an in-flow disclosure with preview state and digest label always visible.
- **Narrow, 390 CSS px fixture:** one faculty row per line, no horizontal carousel, full-width seal action, 44 by 44 CSS-pixel minimum touch targets, and a non-overlapping fixed bottom action only when its state remains visible above the virtual keyboard.
- **Cinematic substrate:** desktop may show the full orbital composition as an optional non-essential background crop. Mobile uses the close crop from the supplied reference or omits it entirely, so critical title, selection count, preview state, and action never compete with the object.

## Deterministic acceptance contract

No implementation was available to capture, so the following is an acceptance manifest and rejection matrix, not a claim of a passing test.

### Freeze before capture

Record build/commit, browser/version, OS, viewport, DPR, font-loaded state, locale, theme, reduced-motion preference, creator catalog identity, fixed preset/manual fixture, exact draft digest, exact preview digest, selected Godskills, review acknowledgement, and all image/network states. Use the same fixed clock for any visible timestamp. Do not accept a capture with an unresolved font or randomized atmospheric seed.

### Required fixture coverage

| fixture | required states |
| --- | --- |
| desktop 1440 × 960 | incomplete, blocked, ready-unacknowledged, ready-acknowledged, finalized mission ledger with observed and proposed rows |
| compact 820 × 1180 | ready review with the evidence shelf in-flow; keyboard focus across drawer, selection, digest, acknowledgement, and action |
| mobile 390 × 844 | incomplete, blocked summary, ready acknowledgement, virtual-keyboard-safe primary action, 200 percent zoom/reflow |
| reduced motion | ready transition and a new mission row with every decorative animation removed while semantic state remains clear |
| fallback | WebGL/canvas unavailable or disabled, with static background and no lost meaning or unreachable control |

### Invariants and rejection criteria

Reject the implementation if any of the following is true:

1. A changed selection leaves a prior review acknowledgement visually or semantically valid.
2. `incomplete`, `blocked`, and `ready` cannot be distinguished by text and structure without color or motion.
3. A `ready` preview looks finalized, sentient, admitted, or otherwise authority-bearing before the bounded finalization result exists.
4. The exact preview digest or selected Godskills cannot be found in the review state, copied by keyboard, or read without relying on an image.
5. A required control lacks visible keyboard focus, a 44 px compact touch target, or a semantic accessible name/state.
6. Reduced-motion or static fallback removes state information, traps focus, or leaves a blank/black operational surface.
7. The desktop rail, mobile drawer, and main chamber disagree about current chapter or selected count.
8. Cinematic substrate, scanlines, chromatic refraction, or handwriting reduces proof-text legibility or meets no named narrative job.
9. A capture uses only a successful hero frame and omits blocked, compact, reduced-motion, fallback, and keyboard fixtures.
10. A performance trace exceeds the selected tier target without a lower-cost fallback, or a new asset is admitted without recorded provenance and budget.

## Explicit anti-patterns

- Do not turn the creator into a generic SaaS wizard, card catalog, RPG character sheet, or neon control deck.
- Do not use red as a permanent brand wash. It is pressure and depth, with generous void around it.
- Do not use gold as a reward confetti color. It marks a verified boundary or a consecrated edge.
- Do not animate because the substrate is “alive.” A selection, digest change, review acknowledgement, or incoming ledger result must cause the motion.
- Do not make the 3D Luna object, CRT texture, sigil, or a single photogenic capture carry evidence that must be read or operated.
- Do not replace architecture vocabulary with mystical language when it would obscure `incomplete`, `blocked`, `ready`, digest linkage, acknowledgement clearing, or closed errors.
- Do not imply that local visual review proves accessibility conformance, finalization success, runtime authority, mission execution, or agent personhood.

## Bounded implementation handoff

**Delegate:** `eternities-frontend-arsenal`.

**Receive:** this visual law; the four-chapter creation/misson hierarchy; token/component grammar; source-extracted protocol facts; motion, accessibility, responsive, and acceptance requirements; and the explicit prohibition against inventing an alternate authority path.

**Deliver:** a local implementation proposal or built surface using semantic HTML/CSS-first components, with no new raster generation and no new continuous 3D requirement. It must preserve the browser’s closed projection, render only supplied state, and produce the fixture evidence named above.

**Do not delegate:** visual-law selection, the source/proposal distinction, authority interpretation, or review/finalization semantics. Those are already constrained here by the evidence and architecture.

## Completion condition

This direction is ready for bounded implementation once the receiving specialist can show the fixed fixture set, the selected state labels and digest evidence, keyboard/reduced-motion/static fallbacks, and measured performance against the declared tier. The unverified surfaces remain live browser behavior, assistive-technology behavior, exact contrast values, asset provenance, and device performance until that evidence is captured.
