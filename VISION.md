# Vision

`axi` should evolve conservatively.
We accept contributions that strengthen AXI without diluting its rigor or expanding shared infrastructure beyond common needs.

## AXI principles

New principles and behavioral changes to existing principles require rigorous validation across representative agents, models, and tasks.
Intuition, preference, and isolated examples are not sufficient.

Small, objective corrections that improve clarity without changing meaning or behavior are welcome.

## Catalog

Contributions adding real, verifiable AXIs to the community catalog are welcome.

Every new package proposed for either catalog may receive a positive admission verdict only after independent source review of the package itself.
The reviewer must inspect the actual package source at an exact pinned revision or release and determine whether the source-defined interface and behavior satisfy all applicable AXI principles, including agent-oriented ergonomics, structured and truthful outputs and errors, and discoverability.

Contributor assertions, pasted transcripts or other contributor-provided verification, generated diffs, package metadata, or existence checks are insufficient evidence on their own.
The verdict must identify the exact pinned source revision or release and the specific relevant source components inspected, such as files, entrypoints, or code paths.
It must distinguish direct source observations from unverified claims and avoid attributing observations to a release or revision that was not inspected.
If the required pinned source inspection cannot be completed, or if the inspected source is insufficient to establish the applicable AXI principles, the verdict must remain inconclusive or request the missing evidence rather than recommend admission.
The independent reviewer is responsible for reaching the strongest conclusion supported by the inspected source without delegating a separate package-execution check.
The identified source components and code paths should be representative of applicable AXI behavior; exhaustive auditing of unrelated package concerns is not required.

The official catalog is maintained directly by the project owner and is not open to contributed additions or edits.

## SDKs

The AXI SDK should provide common-denominator facilities that nearly every AXI needs.
Niche utilities specific to one tool or narrow class of tools do not belong in the shared SDK.

SDKs for additional programming languages are welcome when they:

- remain faithful to the AXI principles;
- are structurally similar to the JavaScript SDK; and
- expose the same common-denominator facilities without language-specific scope expansion.
