# lunari godagent creation and mission surface

## visual thesis

this surface is a **consecrated instrument panel**, not an admin console. it should feel like a quiet chamber already holding a living construction: black-violet void, slow oxblood depth, moonlit language, and gold used only where a fact has been verified or a human must decide. the visual system inherits lunari's deep substrate, sigil logic, filmic darkness, fine grain, and patient breathing motion, while refusing to let atmosphere obscure authority.

the central contrast is deliberate:

- **the living field** is soft, deep, irregular, and peripheral: a dim warped oxblood substrate with sparse grain and restrained sigil geometry.
- **the governed record** is crisp, aligned, and legible: compact text, exact labels, clear timestamps, digest-shaped values, and stable status markers.
- **the human decision** is singular and luminous: one present-tense confirmation action, never a parade of equally loud buttons.

the landing page establishes the right vocabulary: moon text over a breathing red descent, a small gold sigil as an orienting mark, editorial serif for proclamation, and a dim utility face for state. retain that vocabulary. do not import bright enterprise gradients, detached glass cards, or decorative fantasy ornament.

## layout hierarchy

### 1. fixed orientation rail

on desktop, a narrow left rail remains visible. it carries the lunari sigil and wordmark, the current place in the creation or mission journey, and the operator identity at the foot. the active place receives a 2 px crimson incision and a moon dot, echoing the existing deep application navigation. inactive places remain moon-ghost, not disabled-looking.

the rail is orientation, not a second content column. it names only major places: `creation`, `review`, `mission`, `evidence`, and `history`. nested controls live in the main field.

### 2. upper identity line

the main field begins with a single compact line: agent name, role/archetype, and one exact lifecycle label. the left side is identity; the right side is a short environment or session reference. this line must remain visible at the top of every major state so the user never loses whose construction or mission is being viewed.

### 3. primary chamber

the first viewport answers one question only.

| surface state | primary chamber | required immediate answer |
| --- | --- | --- |
| incomplete creation | selected identity and the next missing choice | what must be chosen next? |
| blocked creation | the blocked requirement and its reason | why cannot this advance? |
| ready for review | the exact assembled identity with a review invitation | what, exactly, is about to be sealed? |
| review acknowledged | digest-bound review summary and one confirmation control | what will this confirmation finalize? |
| mission observing | live observation with its capture time | what is known now? |
| proposal awaiting decision | the proposed effect, authority basis, and consequence | what am i being asked to allow? |
| action in progress or reconciled | progress or result with evidence link | what happened and how do we know? |

the chamber is one broad, low-contrast panel with a faint hairline and a slightly darker inner field, not a floating card stack. use a large but bounded title in the landing page's editorial serif. below it, render the governing sentence in moon text, followed by a compact structured record. an agent sigil or small abstract vessel may sit behind the chamber at very low opacity, but it must never sit behind dense copy or interactive controls.

### 4. three proof bands below the chamber

the page then descends through three vertically ordered bands:

1. **constitution and authority**: the bounded authority posture, selected capability names, applicable limits, and any missing preconditions. this is the first band because the model proposes but does not confer permission.
2. **composition and evidence**: the chosen creation facets, selected godskills as named methods, review identity, receipt/digest references, observations, and outcomes. this is detail, not an editable fantasy of hidden internals.
3. **causal history**: a reverse-chronological but visually connected event thread. every row pairs a stable event name with time, actor/source class, and a compact evidence reference. the line joining rows is a quiet gold-to-moon filament, never a busy animated timeline.

within a creation flow, the composition band uses nine equal `selection cells` plus one distinct expression cell. cells show kind, selected name, and a closed status. they are arranged in a strict grid rather than a freeform constellation, because the selection is exact and complete only when every kind is present. in a mission flow, the corresponding grid becomes the mission ledger: observation, proposal, decision, action, and consequence.

### 5. decision dock

when a human acknowledgement or decision is required, anchor a single decision dock to the lower edge of the content field. it repeats only the action's exact target, the binding digest or evidence reference, and one primary control. secondary escape or return behavior is text-level and spatially separate. the dock disappears when no decision is available; it must not reserve an empty, alarming region.

## state language

status is communicated by three redundant channels: a written state name, a shape/icon, and a color treatment. color never carries the meaning by itself.

| state family | copy form | visual treatment | behavior |
| --- | --- | --- | --- |
| incomplete | `incomplete · [next required kind]` | moon-ghost ring, open notch | no pulse; direct focus to the next required cell |
| blocked | `blocked · [closed reason]` | squared crimson bracket plus readable reason | static, high-contrast notice; no celebratory glow |
| ready | `ready for review` | complete gold ring with moon interior | one slow, finite arrival bloom when the state first becomes ready |
| reviewed | `review sealed · [short digest]` | fine gold seal and stable hairline | no continuous animation; preserve the bound reference |
| awaiting human decision | `awaiting your decision` | moon dot inside crimson outline | breathing only around the decision dock, never the whole page |
| executing | `effect in progress` | segmented moon line advancing toward a fixed endpoint | motion runs only while a real pending operation exists |
| reconciled / admitted | `reconciled · verified` or `admitted · verified` | quiet gold check-seal and explicit evidence reference | one short settling motion, then fully static |
| refused / failed / quarantined | exact closed state and reason code | crimson fracture mark plus moon text | static; preserve the evidence and next safe route |

use exact nouns in the visible record: `observation`, `proposal`, `decision`, `action`, `consequence`, `review`, and `receipt`. use evocative language only in headings and atmosphere, never instead of the governing state. for example, “the chamber is waiting” may be a secondary caption, but `awaiting review acknowledgement` is the state.

selected godskills are represented as compact, non-clickbait method seals: name, scope sentence, and a `selected` marker. they never look like powers, permissions, or live autonomous actors. authority is rendered separately, above them, with an unambiguous bounded label such as `authority basis` or `not authorized`.

## motion causality

motion must communicate a cause in the lifecycle, not decorate idle time.

- the background substrate may drift at an almost imperceptible rate, with no directional claim. it supplies depth and stops being noticeable before it competes with reading.
- a sigil inhales once when an agent identity is first loaded and exhales once after verified reconciliation. it does not continuously solicit attention.
- selecting a creation cell produces a short inward settle: the cell's moon edge resolves to a stable value and the progress thread advances one segment. deselecting or replacing reverses only that cell and clears downstream review appearance.
- a transition into `ready for review` completes the nine-cell geometry into a gold perimeter over 500 to 800 ms. it is a completion cue, not proof that finalization occurred.
- a review acknowledgement produces a single seal closure. if any identity or selection changes, the seal visibly opens and the acknowledgement state is removed before the new content is shown.
- an in-flight action uses a contained line or dot traveling from `decision` to `action`, with a fixed end state. a spinner without a named phase is prohibited.
- a successful reconciliation draws a short causal connection from outcome to its evidence reference, then stops. a failed or quarantined state snaps that line at the failed boundary and leaves the reason legible.
- content entrance is staggered by causal order: identity, observed state, authority, possible decision, then evidence. do not reveal unrelated panels on a theatrical timer.

all nonessential movement is disabled under `prefers-reduced-motion: reduce`. essential in-progress feedback becomes a static labeled progress indicator with periodic text updates; no animation is required to understand completion.

## accessibility constraints

- retain real semantic headings, landmark regions, form labels, buttons, and ordered event lists. the sigil is decorative unless it has an explicit text alternative.
- the primary field, state text, and all controls meet at least wcag 2.2 aa contrast. moon-dim and gold can be atmospheric only where they pass contrast or are redundant with adjacent readable text. do not place essential light type over the brightest substrate ridges.
- use a stable reading order that matches the desktop visual order: identity, state, authority, composition/evidence, history, decision. do not rely on CSS reordering to make the mobile view look poetic.
- every status change has an accessible text announcement that identifies the object and new state, for example: `creation preview is ready for review` or `proposal was refused: authority not present`. do not announce background or ornamental transitions.
- keyboard focus is always visible as a 2 px moon outline with an external oxblood halo. focus never depends on a red-only glow and is never hidden behind the decision dock.
- selected cells expose both selection and kind. disabled or blocked cells expose the reason programmatically and in visible text.
- allow a user-controlled texture reduction in addition to reduced motion. this removes grain, chromatic split, and nonessential glow while preserving hierarchy and state.
- body copy has a maximum measure of roughly 60 to 70 characters, a line height of at least 1.5, and no required information rendered as handwritten or pixel-display type. those expressive faces may label the realm, never carry operational facts.

## responsive behavior

desktop preserves the fixed orientation rail and a single broad central field. the primary chamber has a maximum readable width; proof bands can use two columns only when both columns remain at least 280 px wide. the decision dock aligns to the main field rather than spanning under the rail.

at 820 px and below, remove the persistent rail and replace it with a compact header: sigil, agent identity, lifecycle state, and a menu that exposes major places. the primary chamber remains first. proof bands become one column in the same semantic sequence, and the nine selection cells become a two-column grid that never changes their canonical kind order.

at 480 px and below, use a single-column selection list with the kind label above each value. the decision dock becomes an in-flow, full-width block placed immediately after the evidence that binds it, avoiding a fixed panel that obscures content or the keyboard. lifecycle history stays condensed by default but is expanded by a native button with its count and state exposed. no horizontal scrolling, hover-only explanation, or icon-only critical action is permitted.

the visual substrate changes scale rather than being cropped unpredictably: on narrow screens, lower grain and shader contrast, reduce sigil geometry, and reserve the brightest red for state punctuation. this protects text density and touch targets. interactive targets are at least 44 by 44 css px, with 8 px minimum separation between adjacent controls.

## deterministic acceptance checks

the following checks can be performed from fixed screenshots, DOM inspection, and scripted state fixtures. they are acceptance criteria, not mood judgments.

1. **orientation**: at desktop width, the fixed rail shows the lunari mark, exactly one active major place, and the current agent identity remains visible above the fold. at mobile width, the compact header shows the same identity and lifecycle state before any selection controls.
2. **state clarity**: each fixture from the state-language table displays an exact written state, its distinctive shape, and a color treatment. removing color in a grayscale capture leaves the state families distinguishable by text and shape.
3. **authority separation**: in every ready, awaiting-decision, executing, reconciled, and refused fixture, authority information appears before selected godskills and before the primary action. no godskill label is phrased or styled as a permission grant.
4. **creation completeness**: a ready-review fixture shows exactly nine kind-labeled selection cells and one expression cell, each with a visible resolved state. an incomplete fixture names the next missing kind and cannot expose a final confirmation control.
5. **review binding**: changing any identity or selection in a reviewed fixture removes the visible sealed state and disables or removes the previous confirmation control before rendering the new preview. the new state shows that review is required again.
6. **decision singularity**: when a decision is required, one primary action has the highest visual prominence. all other actions are secondary, and the dock names the bound target and its reference.
7. **causal trace**: a reconciled fixture includes observation, proposal, decision, action, and consequence in a readable causal sequence, each with a timestamp or stable event reference. a failed fixture preserves the last completed boundary and displays the closed reason at the break.
8. **motion safety**: with reduced motion enabled, all decorative motion, reveal staggering, shimmer, grain movement, and sigil breathing stop. lifecycle status remains understandable through static text and indicators.
9. **keyboard operation**: every interactive selection, history disclosure, and decision control is reachable in the documented reading order, has a visible focus treatment, and can be completed without pointer input. focus is not covered by sticky UI at 320 px viewport width and 200% zoom.
10. **text and contrast**: automated contrast checks pass for all operational text and controls in the normal, blocked, selected, and focus states. a narrow-screen capture has no horizontal page overflow and keeps all essential text at 200% zoom without clipping.
11. **honest progress**: an executing fixture contains a named pending phase and a determinate endpoint or explicitly labeled waiting condition. no indefinite unlabeled spinner appears anywhere in the creation or mission journey.
12. **visual restraint**: a screenshot comparison confirms that no more than one persistent crimson attention treatment and one persistent gold verification treatment are visible in the first viewport. exceptions require the state fixture itself to be blocked or awaiting decision.

## explicit anti-patterns

- a “god mode” control room that turns authority into spectacle or paints every selected godskill as a supernatural power-up.
- generic saas cards, blue success states, neon gradient blobs, frosted-glass stacks, or oversized numeric dashboards that sever the surface from lunari's deep.
- using gold as a generic accent. gold means verified, sealed, or oriented. crimson means attention, refusal, or a single human decision, not ordinary navigation.
- a sigil, 3d object, shader, or glitch effect placed behind essential copy, form labels, state reasons, or focus indicators.
- motion that pretends an action occurred, loops after a result is settled, or continues when the underlying lifecycle is static.
- poetic labels that replace operational truth, such as “the oracle has spoken” in place of a proposal state or “the ritual is complete” in place of verified finalization.
- hiding blocked reasons in tooltips, hover states, color alone, or expandable diagnostics. the reason must be present at the blocked boundary.
- presenting receipt, digest, or evidence references as decoration while making them unreadable, uncopyable, or visually lower priority than ambience.
- a mobile layout that merely shrinks the desktop rail, forces horizontal card carousels, or makes the decision control hover-dependent.
- a permanent full-screen urgency state. the chamber may be mysterious, but it must become calm and still after a verified outcome.
