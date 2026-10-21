# Revised tool on the original testing corpus

The frozen e8c1679 production tool was evaluated on the same44 saved testing pages
across22 eligible sites selected from the original40 candidates. The tool had been
repaired on the18 development pages. This testing run made no production, prompt,
reference or scorer changes and used no new model or live-site requests.

| Policy | All reading checks | Without fallback | Both-page pairs without fallback |
|---|---:|---:|---:|
| General fallback | 41/44 (93.2%) | Not applicable | Not applicable |
| Per-page compiled procedure | 40/44 (90.9%) | 37/44 (84.1%) | 17/22 (77.3%) |
| Shared first-page procedure | 40/44 (90.9%) | 32/44 (72.7%) | 14/22 (63.6%) |

All132 policy/page measurements completed without a measurement error. Each site
count requires both original seed and transfer pages to pass. The first-page
procedure was transferred unchanged; a scientific rejection retained fallback
and was not repaired or relabeled. Compilation adjustments remain distinct from
unadjusted model selection and runtime fallback.

The predeclared paper-update criterion was shared compiled no-fallback page
success strictly above80%, requiring at least36/44 and genuine completion of all
132 measurements. The result32/44 does not meet it. The paper and its existing
results remain unchanged. Fresh-rule84.1% and reading-with-fallback90.9% do not
substitute for the primary shared criterion.

Every policy retained all715 declared text/structure targets. The three fallback
reading failures and four per-page/shared reading failures involved selected
links, with no declared image loss, retained noise or unresolved relative URLs.
Eight shared applications declined or lacked a usable procedure: four preservation
rejections, two raw-candidate selector uniqueness failures, one structural-scope
mismatch and one transferred-region uniqueness failure. Four applied shared
procedures additionally failed link checks. Rule execution alone is insufficient
for full success.

Compared with the original pipeline on these same inputs, shared no-fallback
passes increased from13/44 pages and4/22 pairs to32/44 and14/22. Per-page no-fallback
passes increased from13/44 to37/44. This is a pipeline comparison with historical
raw model candidates, not a controlled ablation attributing gains to one change.
General fallback remains stronger on complete-page reading checks.

The measurements use historical raw AI candidates bound to the original44
completed request records. They do not test new rule generation from the compact
sample, cold API admission, a public shared service, participant benefit, WCAG
conformance or new-corpus generalization. The22 site pairs have unclassified
template relationships; one original Harvard pair spans subdomains, broader than
production hostname-cache lookup. Source-derived references are engineering
proxies rather than independent human gold annotations.

Before measurement, the parent independently verified317 original capture/harness
bindings,44 complete provider/context/input/backend hash chains and all10 frozen
production hashes. Review also bound Node/Chromium/Playwright runtimes and the
reporting gate. Seventeen focused tests pass; the full local regression suite
also passed, with the focused checks rerun after final harness repairs. Native
review findings were fixed and accepted before the four-page pilot. The parent
then checked the pilot and accepted its checksum before the remaining40 pages.

The final parent audit independently recomputed all132 rows, original reference
arrays, content/destination/image/noise predicates, both-page conjunctions,
fallback labels and identical shared procedure hashes. Zero measurement errors
were recorded. Full phase took103.781seconds, in addition to the51.891second
pilot; these are execution durations, not user latency or model inference speed.

Evidence: [summary and gate](summary.json), [per-page results](per-page.csv),
[site-pair results](per-site.csv), [baseline comparison](baseline-comparison.csv),
[parent acceptance](parent-full-acceptance.json), [failure components](parent-failure-components.json),
[protocol](protocol.json), [runtime/source freeze](freeze.json) and review verdicts.
Raw article/reader HTML remains preserved in ignored
`workspace/task023/revised-testing/frozen-e8-v1/`; original inputs are untouched.
The worker completed all measurements but stopped after two compact-export
errors; the parent independently completed the CSV/metadata exports. No raw
results were rerun or altered for that recovery.
