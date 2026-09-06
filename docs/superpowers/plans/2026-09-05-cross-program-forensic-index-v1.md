# cross-program forensic index v1 implementation plan

1. add failing tests for multi-program sorting, exact prefix/head binding,
   digest-only output, recovered and failed lifecycle evidence, and rejection
   of duplicate, drifted, credential-shaped, authority-bearing, and oversized
   input;
2. implement the bounded runtime module and strict schema by composing the
   existing forensic and operation-evidence verifiers;
3. build a deterministic two-program fixture and focused certification test;
4. issue an append-only receipt with the full test count and release gates;
5. add the receipt to the certification ledger and current-head evidence;
6. run focused, full, ledger, lineage, and current-head verification before
   merge.

The implementation must remain body-free and must not change the public SDK
surface or Godskills repository.
