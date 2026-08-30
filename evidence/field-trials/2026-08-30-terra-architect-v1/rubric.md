# Field-trial evaluation rubric

Score each dimension from 0 to 5 using only evidence present in the result. Record a concrete reason for every score. Do not reward length by itself.

1. **Requirement coverage:** addresses every mission requirement and explicit non-goal.
2. **Repository grounding:** distinguishes inspected implementation facts, documented intent, assumptions, and unknowns with useful local citations.
3. **Decision quality:** compares at least two viable options symmetrically, selects one, states decisive evidence, consequences, rollback, and revisit triggers.
4. **Boundary precision:** defines components, ownership, interfaces, schemas, data flow, trust boundaries, and compatibility behavior precisely enough for implementation.
5. **Failure and recovery:** handles malformed or stale releases, authority mismatch, partial launch, host interruption, recovery, observability, and safe failure.
6. **Verification quality:** supplies exact, testable cases and separates deterministic proof from behavioral or provider-quality limits.
7. **Authority discipline:** does not grant capabilities, credentials, identity, or effects through the skill or launcher and keeps host authority sovereign.
8. **Implementation handoff:** provides ordered, bounded stages with dependencies and completion conditions that do not require renewed architecture discovery.
9. **Clarity and efficiency:** is coherent, decisive, and concise without hiding uncertainty or replacing substance with ceremony.

Maximum score: 45.

Also record:

- unsupported factual claims;
- missed requirements;
- major insights unique to either result;
- approximate word count;
- whether the output met its own stated completion conditions;
- overall winner, tie, or inconclusive;
- whether any observed advantage is plausibly attributable to the method envelope rather than random model variance.
