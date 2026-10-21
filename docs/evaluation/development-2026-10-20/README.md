# Development extraction verification — 20 October 2026

This is a retained-candidate, compiled-procedure replay on the original18 public
development snapshots across nine sites. Production extraction runs in isolated
Chromium with controlled Chrome messaging. It is not a test of new model generation,
cold backend admission, a deployed public service or unseen performance.

| Approach | Original endpoint | Stronger additive endpoint | Additive no-fallback pages / pairs |
|---|---|---|---|
| General fallback | 15/15 scorable;3 indeterminate | 18/18 | Not applicable |
| Compiled fresh procedure | 15/15 scorable;3 indeterminate | 18/18 | 18/18;9/9 |
| Unchanged first-page procedure | 15/15 scorable;3 indeterminate | 18/18 | 18/18;9/9 |

The original frozen scorer and references remain unchanged. Three original pages
had only one target and could not satisfy its minimum-three-target condition. The
source-only additive benchmark unions every original strict target with all119
historical source anchors across all18 pages. It adds63 distinct requirements,
yielding325 targets, and retains all original link, image and noise checks. It
remains source-derived engineering annotation rather than independent human
accessibility ground truth.

Every approach retained325/325 additive targets,119/119 legacy anchors,27/27
required links and11/11 images, with no frozen noise retained. Shared procedures
were compiled on each pair's first page and applied unchanged to the second; no
transfer-page recompilation or runtime fallback was relabeled as rule success.
Compiler-added regions and dropped exclusions remain explicitly recorded. These
results do not establish accuracy of unadjusted model rules or superiority to
general fallback, which also passed the content checks.

The repairs are generic: preserve navigation within semantic reading regions;
retain already precise nonpositional selectors; canonicalize adjacent text nodes
on sanitized clones without changing text or code whitespace; and discard
exclusions that have no seed-page evidence. No website/domain/expected-answer
lookup was introduced. The44-page heldout corpus was not consulted or rerun.

The production structural sampler uses at most12,000 characters. Across18 pages,
the maximum was11,999 and the median9,482. Every declared role category was
represented; this does not prove every important instance was included. The
median reduction relative to full BODY markup was85.90% by characters, not billed
tokens or total service cost. No new prototype model requests or live-site
requests were made. New generation quality from these samples remains unmeasured.

Local API publication still requires two distinct complete examples and retains
its original complete-context and request-size bounds. Its admitted-cache coverage
is not measured by this direct compiled-rule replay. A larger sanitized body still
goes to the backend for deterministic validation; that is separate from model input.
No production backend was restarted, deployed or publicly exposed.

The parent independently checked all54 rows per endpoint, all18 IDs/nine pairs,
every production/input/artifact hash, every target/destination/image/noise
predicate, same-seed procedure hashes and fallback provenance. The final full local
suite passed in45.33seconds; seven source-union and four tamper checks passed.
Both isolated browser checks also passed. Native review found and then verified
repairs to three replay-provenance defects; final code follow-ups found no
actionable findings.

Evidence: [parent acceptance](parent-acceptance.json), [per-page counts](per-page.csv),
[sampling measurements](sampling.json), [additive annotation freeze](additive-benchmark/manifest.json),
[production freeze](freeze.json), and native review verdict/status files in this
directory. Exact production snapshots are retained under `source-snapshot/`.
Full reading outputs and raw source captures remain preserved in the ignored
`workspace/task023/training-improvement/replay-v3/` and original development cache;
their artifact hashes are retained here without copying full articles.

The manuscript and its reported unseen experiment were left unchanged. The next
generalization assessment needs new reserved inputs and one fixed annotation and
scoring policy; development perfection is not evidence of unseen accuracy.
