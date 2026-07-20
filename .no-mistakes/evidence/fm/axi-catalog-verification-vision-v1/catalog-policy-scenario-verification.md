# AXI catalog policy scenario verification

Tested target: `64f3c4b6fe5bdc70fa3098917e19d3a1e5db0d69`

This artifact exercises the changed `VISION.md` as a generic catalog reviewer would use it. A positive verdict means the policy permits admission. It does not mean admission is automatic.

## End-user decision scenarios

| Proposal evidence available to the reviewer | Catalog | Expected verdict from `VISION.md` | Policy reason |
| --- | --- | --- | --- |
| Reviewer independently inspects source at pinned revision `abc123`, identifies the relevant entrypoint and output/error paths, and runs released package `1.2.3` through representative success, invalid-input error, no-results, and `--help` discovery paths. Direct observations cover every applicable AXI principle. | Community | Positive verdict is permitted | Independent pinned-source inspection, released-package execution, representative behavior, and exact provenance are all present. |
| Same evidence as above, for a package selected by the project owner. | Official | Positive verdict is permitted for the owner-maintained catalog | The evidence bar applies to either catalog, while the official catalog remains maintained directly by the project owner and closed to contributed edits. |
| Contributor supplies claims, pasted success/error transcripts, a generated diff, package metadata, and proof that the package name exists, but the reviewer cannot inspect source. | Community | Inconclusive or request source evidence | Contributor-provided verification and existence/metadata checks are insufficient on their own, and required independent source inspection is unavailable. |
| Reviewer inspects a pinned source revision, but a runnable release exists and the reviewer does not execute it. | Either | Inconclusive or request execution evidence | A runnable release requires representative released-package success, error, and discovery execution. |
| Reviewer independently inspects pinned source for a package with no runnable release and records the relevant files, entrypoint, and observable interface behavior across every applicable principle. | Either | Positive verdict can be considered without package execution | Execution is conditional on a runnable release existing; pinned source inspection and applicable-principle evidence remain mandatory. |
| Reviewer executes a local contributor checkout or unreleased build and labels the results as behavior of release `2.0.0`. | Either | Inconclusive or corrected evidence request | The policy forbids attributing observations to a release or revision that was not inspected and requires the exact released version when execution applies. |
| Independent source and released-package checks cover AXI-facing behavior, but do not audit unrelated dependency licensing or business risks. | Either | AXI admission review can proceed | Review is explicitly proportional to applicable AXI behavior and need not exhaustively audit unrelated package concerns. |
| A proposal was already open when the policy changed, but only contributor claims and metadata are currently present. | Community | Inconclusive until the new evidence bar is met | The policy says every new package proposal may receive a positive verdict only after the required review. It contains no grandfathering exception. |

## Acceptance-criteria trace

- Both catalogs: "Every new package proposed for either catalog".
- Independent pinned source: reviewer "must inspect the actual source at a pinned revision or release".
- Released behavior: when runnable, reviewer executes representative "success, error, and discovery paths".
- Complete AXI scope: observations must satisfy "all applicable AXI principles".
- Exact provenance: verdict identifies the pinned revision/release, relevant files or code paths, released version, and exercised behavior.
- Insufficient evidence: contributor claims, pasted verification, generated diffs, metadata, and existence checks do not suffice by themselves.
- Fail closed: unavailable required inspection yields an inconclusive verdict or evidence request.
- Ownership: official catalog remains maintained directly by the project owner and closed to contributed additions or edits.
- Proportionality: unrelated exhaustive auditing is not required.
- Self-contained scope: the policy names no Wheelhouse or downstream implementation.

## Pending-proposal compatibility check

At test time, the open community catalog proposals included PRs #79, #93, #98, #99, #101, #102, #104, and #105. The policy text itself applies the evidence bar to every new proposal without grandfathering. However, there is no PR for branch `fm/axi-catalog-verification-vision-v1`, so the required PR-level explanation of how pending proposals should be handled cannot yet be verified.
