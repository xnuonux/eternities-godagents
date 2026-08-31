# specialist preference adapter v1 design

## decision

Godagents may forward a specialist genome's already-derived preferred
capability ids to the separately certified Godskills preference router. this is
an optional ranking signal only. it never changes eligibility, prohibition,
authority, effects, risk, evidence, context, composition, or activation.

## trust boundary

the host enables the extension only through the exact
`eternities-godskills-specialist-preference-v1` release receipt. Godagents
verifies the receipt's logical digest, four historical parents, complete
thirteen-module executable closure, nineteen source bindings, two routing
artifacts, deterministic fixture, proof limits, and every file digest before
selecting `scripts/intent-preference.mjs`.

the immutable host release pin remains the authority for enablement. a mutable
file appearing in the Godskills checkout is not sufficient.

## profile behavior

- specialist plus verified root plus nonempty `preferredIds`: forward the exact
  sorted eligibility-derived set;
- all-rounder: omit the preference field, even if preferred families are
  present in malformed or legacy policy data;
- release without the preference root: use the historical request and
  executable unchanged;
- non-preferred capabilities remain eligible and may win every stronger
  quality comparison.

## durable identity

the source envelope binds the preference trust-root digest and exact supplied
ids. the cycle receipt binds the supplied, qualified, selected, historical
baseline, and semantic-candidate sets, the application disposition and reason,
and a canonical preference digest. selected ids must match the ordinary route
and cycle selection.

recovery performs no routing. it derives the expected preference identity from
the current verified release and genome, validates the committed binding, then
rebuilds the same package and requires the existing stack and package digests.

## closed validation

Godagents rejects changed protocol, root, request digest, decision policy,
supplied order, qualification, semantic candidate set, selected echo,
application flag, reason, dependency closure, source set, routing artifact,
output fixture, or parent identity. terminal-only reasons cannot describe a
selected route.

## host execution

a preference-pinned host chooses the separately pinned preference CLI. a
legacy host chooses `scripts/intent.mjs`. both use a non-shell child process and
contained temporary files. transport injection remains an explicit testing and
embedding boundary, not proof that an arbitrary caller executed the local CLI.

## proof boundary

this milestone proves deterministic mechanism, exact local release binding,
profile isolation, authority monotonicity, receipt identity, and no-reroute
recovery for the tested implementation. it does not prove specialist quality
superiority, unseen natural-language routing correctness, hostile same-user
filesystem isolation, production telemetry, global activation, model or
provider quality, executed independent review, or Lunari integration.
