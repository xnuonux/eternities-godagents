# Round 2: reproducible failure diagnosis

## Routing mission

Debug this reproducible failure from the available evidence. Find the smallest confirmed cause before changing behavior.

## Assignment

Run the sealed journal-recovery tests in the supplied fixture, isolate the confirmed causes, and produce one minimal unified patch plus a concise diagnosis. Do not edit the fixture itself. The evaluator will apply your patch to a fresh copy and run the sealed tests.

Allowed writes: only your assigned result file and patch file. Do not use the network, inspect the paired output, weaken tests, propose destructive recovery, or claim success without reproducible evidence.

The result must include reproduction, hypothesis ranking, confirmed root cause, patch rationale, rollback, uncertainty, and termination condition.
