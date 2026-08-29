# Local Admission Shell v1 Certification Plan

## Goal

Issue one immutable receipt proving the reviewed local admission shell without modifying any preceding receipt or widening its trusted-local boundary.

## Tasks

1. Add fail-closed receipt-builder tests for `GLA-001` through `GLA-009`, proof gates, and exact exclusions.
2. Add a deterministic fixture runner that compiles a creation, writes exact Prompt OS and Realm inputs, executes `admitLocalCreation` with a fixed clock, and captures the complete workspace byte manifest.
3. Run two isolated fixtures under the certifier, compare exact identities and bytes, verify six historical receipt pins, bind source and test manifests, and write only the new receipt after clean-source checks.
4. Add the package command and narrow architecture/operator documentation.
5. Run the complete guarded suite and historical builds, request independent review, generate the receipt from its pinned clean source commit, merge, reproduce receipt bytes, push, verify parity, and clean the worktree.

## Acceptance

- every requirement and proof gate is fail-closed;
- two isolated admissions produce identical bounded results and workspace bytes;
- all historical builds and receipts remain unchanged;
- independent review reports no unresolved P0, P1, or P2 defect within the stated boundary;
- main and origin/main are equal after merged verification.
