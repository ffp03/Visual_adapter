# Revision evaluation harness

Offline only: no generation, provider calls, backend startup, browser network or changes to frozen evidence.

From the repository root (Node 22):

```powershell
node --test tests/revision/eval
node tests/revision/eval/score.cjs output.html reference.json
node tests/revision/eval/score.cjs output.txt reference.json --presenceThreshold=0.9 --exactBelowTokens=5 --completeThreshold=0.95 --noiseThreshold=0.2 --orderThreshold=0.9
node tests/revision/eval/run-baselines.cjs workspace/revision/corpus/dev-manifest.json workspace/revision/results/dev-baselines-v1
node tests/revision/eval/run-available-dev.cjs workspace/revision/results/available-dev-v1
node tests/revision/eval/stats.cjs workspace/revision/results/dev-baselines-v1/rows.jsonl P2-nr P0
node tests/revision/eval/report.cjs workspace/revision/results/dev-baselines-v1/summary.json
node tests/revision/eval/replay-october.cjs workspace/revision/results/october-smoke-v1 1
```

Omit the last smoke argument to replay all contracted October candidates. That replay verifies source, candidate and outcome hashes before execution; its output is a November jsdom diagnostic, not an October accuracy replication. It never invokes archived acceptance scripts. `P2` uses unchanged compile/apply; `P2-nr` uses original render/clean without any repair or inventory acceptance gate.

Manifest: an array, `{pages:[...]}`, or the capture worker's canonical `{sites:[{siteId,host,pages:[...]}]}`. Each page has `id` (or `pageId`), `site` (or `host`), `url`/`finalUrl`, `sourceFile` and `referenceFile`. Nested manifests inherit site/host and default to `dev/<siteId>/<pageId>/rendered-dom.html` and `reference.json` relative to the manifest. Paths may be repository-relative, absolute, or manifest-relative. Optional capture directory aliases: `directory`, `dir`, `path`; optional source aliases: `htmlPath`, `capturePath`; reference alias: `referencePath`. Optional `sourceSha256`/`sha256`, `referenceSha256` are verified. References use design section 2: ordered `content` and `noise` arrays. `audited:true` (or `audit.status:'audited'`) opts into the separate audited subset report.

P0/P1 run on every referenced page. Add `candidate:{main,exclude,name}` or `candidateFile`/`candidatePath` to run P2 and P2-nr. Candidate files may contain the rule directly or an October `{rule:...}` provider envelope; optional `candidateSha256` binds the original file bytes. Invalid candidates remain as empty-output failures. Missing references are recorded as pending, never presented as scored pages. Missing or hash-mismatched sources produce failure rows. Invalid references stop the run rather than inventing a score.

Fresh P2 compiles each page separately. For shared P2, pass `shared` as the third runner CLI argument (or `{p2Mode:'shared'}` programmatically), bind each page's `seedId`/`inductionPageId` to p1, and supply p1's candidate on that seed entry. P2 compiles once on the seed's complete capture and applies the resulting procedure unchanged on targets; P2-nr applies the seed's raw candidate directly. The rows bind the seed source and compiled procedure hashes. Keep fresh/shared variants in separate result folders; mixed-mode manifests are rejected.

Each new output folder contains incremental `rows.jsonl`, per-page policy HTML, `summary.json`, and a Markdown report. Existing output folders and junctions escaping the results area are refused. Candidate file byte hashes and rule hashes have separate fields. The summary includes all declared accuracy measures with 10,000-resample site-clustered percentile intervals (seed 20261120), failure counts/categories/reasons, accounting, paired differences against P0/P1, and audited-only results where available. Pairing requires matching capture/reference hashes and thresholds. Zero model requests/tokens/cost describe this offline replay, not the historical generation cost. Local extraction latency excludes DOM scoring and startup; no browser/user latency claim follows. Shared compilation is cached and excluded from per-target application latency, so these timings must not be used for policy performance comparisons.

`manifest.snapshot.json` and per-page `*-reference.json` preserve the exact scoring inputs for each run, even if the capture worker later revises a reference. `referenceSnapshotFile` is relative to the result folder; `referenceFile` retains the original annotation path. Frozen capture hashes remain bound to their original files.

Programmatic exports: `score(output, reference, options)` (text by default; `format:'html'` for HTML), normalization/token/LCS helpers, each policy's `run`, P2 `replay`/`compile`, `clustered`, `summarize`, `pairedDifference`, and runner `run(manifestFile, newOutputDirectory, options)`. Statistical options are `seed` and `resamples`; runner scoring options are under `thresholds`. Corpus operations use subprocesses with a configurable `timeoutMs` (120,000 for P0; 60,000 for other operations, including shared seed compilation); timeouts are explicit counted runtime failures with null latency. Extraction latency is measured inside the child, excluding process startup. Limited child stderr is saved as row diagnostics. CLI progress goes to stderr, Markdown to stdout. See `DECISIONS.md` for minor conventions. Policy functions return `{html,text,ok,reason}` plus diagnostic/accounting fields; they create isolated jsdom documents and disable source script execution/resource loading.

Section 3's monotone consuming occurrence assignment uses a single consumed-output-token set across every content unit, including differently worded and nested units. Units of at least five tokens choose the earliest qualifying LCS start (after the previous position, then anywhere unused), without preferring a later exact substring. At that start they use the longest available continuation, with earliest output/reference index tie-breakers. Short units retain exact-substring matching. Independent presence/recall and noise LCS remain unchanged; present units that cannot receive an unused alignment stay in recall but fail order. Rows bind `scoringVersion`, and paired statistics reject mixing versions. Content rows preserve assigned positions and consumed token indices. The supplied omitted-colour-paragraph and early-partial-title review cases are regression tests.

Run 3 replaces raw DOM textContent with the design's block-boundary extraction. Both imports below expose the same function:

```js
const { extractText } = require('./tests/revision/eval/score.cjs');
// Equivalent: require('./tests/revision/eval/text.cjs').extractText
const pageText = extractText(htmlString);
const unitText = extractText(document.querySelector('article p'));
```

It accepts HTML strings, Documents, Elements, text nodes and DocumentFragments. Existing DOM inputs are never mutated. It inserts spaces before and after semantic HTML block elements (including headings, paragraphs, div/main/article/section, lists, tables/rows/cells), br, li, td and th; inline markup keeps adjacent characters together. It excludes head, script, style, template and noscript, then NFKC-normalizes and collapses whitespace with case kept. The tag list is in `text.cjs`; it does not depend on computed CSS or network resources. Annotators should call this function on each selected unit, and reference checking should call it on the capture. `htmlText` remains an alias for compatibility.

Freeze currently valid references before a baseline run:

```powershell
node tests/revision/eval/references.cjs workspace/revision/corpus/dev-manifest.json workspace/revision/results/valid-inputs-v1
node tests/revision/eval/run-baselines.cjs workspace/revision/results/valid-inputs-v1/manifest.json workspace/revision/results/baselines-v1
```

The freezer checks exact unit text against the same extracted capture text, rejects empty units and duplicate annotations exceeding source occurrence counts, checks declared hashes, snapshots valid reference bytes, and lists every excluded page and reason in its manifest. It never rewrites corpus references. P0 now defaults to the approved 120,000 ms limit; other operations keep 60,000 ms unless `timeoutMs` is explicitly supplied. The production P0 algorithm is unchanged.

Reusable scoreboard and agent output contract:

```powershell
node tests/revision/eval/scoreboard.cjs MANIFEST BASELINE_FOLDER AGENT_FOLDER [ANOTHER_FOLDER] --out=workspace/revision/results/scoreboard-v1
```

`--out` is optional: without it the command only prints Markdown. `--seed=20261120` and `--resamples=10000` can override statistical defaults. Programmatic use is `require('./tests/revision/eval/scoreboard.cjs').run(manifestFile, folders, options)`; `options.outputDirectory` enables the same persisted artifacts. The return value is `{rows,summary,markdown}`.

Each supplied folder must contain UTF-8 `rows.jsonl`. It can hold one or several policies. Each row identifies a page and policy; HTML defaults to `<pageId>-<policy>.html` in that same folder. For example, `dev-01-p3-P4-qwen.html` goes with:

```json
{"id":"dev-01-p3","policy":"P4-qwen","ok":true,"reason":null,"fallback":false,"modelRequests":2,"tokens":{"prompt":1000,"completion":200,"cached":128}}
```

Required metadata: `id` (or `pageId`), `policy`, boolean `ok`, boolean `fallback`, and nonnegative integer `modelRequests`. Policy names use letters, digits, `_`, `-`, `.`; distinguish models and variants in the policy name. Optional accounting uses flat `promptTokens`, `completionTokens`, `cachedTokens`, or nested `tokens.prompt`, `tokens.completion`, `tokens.cached`; flat values take precedence and absent token fields default to zero. A supplied `tokens` value must be an object with those three optional keys; unsupported shapes/keys are flagged rather than silently losing accounting. Cached tokens are a subset of prompt tokens and are not added again. Optional `costEstimate` is a nonnegative number and `latencyMs` is nonnegative or null. Provide `sourceSha256` and `outputSha256` when possible; supplied values are verified. `outputFile` can override the default HTML basename, but must be relative and resolve inside the folder. The existing baseline runner's folders work unchanged, including its hashed `outputFile` names.

`ok:false` requires a nonempty `reason` and counts as a failed own-policy attempt. With `fallback:false`, an unsuccessful attempt is scored as empty output and needs no HTML. With `fallback:true`, supply the delivered reader HTML even when `ok:false`: the scoreboard scores that delivered artifact, counts the rule failure and fallback, and makes no-fallback pass false. This preserves separate reading quality and failure accounting. Missing artifacts, malformed metadata and supplied hash mismatches are counted failures. Invalid accounting values are zero-normalized and flagged with `metadataErrors` and `summary.accountingIncomplete`; raw JSONL snapshots preserve the original evidence.

The manifest defines the common comparison cohort. Every discovered policy gets one row for every valid referenced page; missing JSONL rows become counted `missing-policy-row` failures. For held-out-only comparisons, pass a held-out-only manifest. Rows outside the manifest are listed separately and excluded from cohort accounting; shared induction requests/cost must be attributed exactly once to an in-cohort row or reported through the separate ledger, never duplicated on every target page. Duplicate `(id,policy)` rows across folders are rejected rather than silently overwritten.

The scoreboard always recomputes scores using the supplied manifest's references and current extractor. Existing input `scores`, scoring versions and reference hashes are provenance only, so older baseline HTML can be rescored after annotation repairs; capture and supplied output hashes must still match. Invalid references are listed and excluded identically from every policy, with page IDs/reasons printed as well as saved. A zero-valid-reference cohort produces no invented estimates or intervals. Snapshots preserve manifest/reference bytes, input JSONL, and the exact evaluated HTML. Summaries include per-site/overall measures, clean-failure attribution, accounting, and seeded paired site-clustered differences of every non-P0/P1 policy against each supplied baseline, with per-page wins/losses/ties for every measure. Missing baselines are explicitly reported as unavailable. Comparisons use the same valid-page denominator, including policy failures and missing outputs.

The installed cssstyle border-variable parser error is handled in the harness's scoped DOM compatibility wrapper, without editing dependencies or production core. Only the failing decorative border declaration is skipped; markup, other declarations and base URLs remain. Per-row `cssCompatibilitySkipped` records its use. The compatibility wrapper is restored after each synchronous operation.

`summary.bySite` and `report.cjs` supply the requested per-site scoreboard; overall confidence intervals still use site-clustered bootstrap. `cleanFailureBreakdown` reports overlapping recall, missing-title, order and noise causes and disjoint cause combinations. Title-first failures are diagnostic, not an extra gate beyond the declared clean-pass definition.

Every content unit must carry a boolean `required` field; strings, numbers, null and missing flags reject the reference rather than changing its denominator. The direct `score()` API and shared reference validator both enforce this.

LCS resource bounds are explicit in `lcs.cjs`: sparse match materialization stops at 100,000 pairs; denser cases use exact rolling-row/checkpoint DP with one reused reconstruction block. Dense work is capped at 200,000,000 cells and DP workspace at 32 MiB. Beyond those limits, `lcs-resource-limit` stops scoring explicitly; the scorer never substitutes an approximate success or drops the unit. A full-matchable-token shortcut handles near-complete units with absent tokens without constructing pair products. Tests run the supplied 10,000-token unit and a dense ordering stress case in a 128 MiB heap subprocess with a 25-second limit, and compare both backends against deterministic/exhaustive small cases.

Audits are read from reference metadata only: `audited:true` or `audit.status:'audited'`. `summary.audited` contains separate policy estimates, site tables, failure attribution, paired differences and page identities for those references; it is null when no audited pages exist. Markdown prints audited results alongside all-reference results. Audited rows are a subset of the all-reference cohort, so their counts/accounting must not be added to the overall totals.
