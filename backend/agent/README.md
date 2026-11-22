# Revision agent (WP-C1)

The implementation follows `docs/revision/DESIGN-2026-11.md`, sections 5–9. It does
not modify the October reader/compiler or consult references in the gate.

## Entry points

- `extension/procedure-v3.js`: UMD `ProcedureV3` (load `procedure-core.js` first), or
  CommonJS. `validate(rule, document)`, `render(document, rule)`,
  `inventory(documents, {mode})`, `gate(documents, rule, {mode})`, and
  `useTime(document, rule, inductionVerdict)` return deterministic results.
  `render` returns a detached DIV; `gate` returns per-page HTML/coverage/reasons and
  non-sidebar coverage. `useTime` returns `accepted`, `fallback`, reasons, and
  attempted HTML. The caller owns actually invoking the basic reader on failure.
- `outline.cjs`: `new Views(documents, {mode:'P4', cueLength:60})` provides
  `initial()`, `outline(pageNumber, nodeId, depth)`, `query(selector)`, and
  `preview(rule)`. Page numbers start at 1; node handles are stable for each
  unchanged page. Cue length is 0, 60, or `'full'`. Each response shares a
  12,000-character cue allowance per page, with 8,000-character outlines.
- `loop.cjs`: `runLoop({pages, runner, ledger, mode, cueLength, site, pagePaths})`.
  P4 requires two induction documents; P3 requires one. A runner implements
  `generate(messages)` and returns `{content, usage}`; scripted runners can return
  `{rule: actionObject, usage}`. Every action consumes one of at most six requests.
  Invalid actions and rejected previews remain in the accounting. A failed
  transport ends the attempt without automatic retry. Submit ends the attempt.
- `runners.cjs`: `DeepSeekRunner({thinking:false, ledger})`,
  `CodexRunner({ledger})`, and `HTTPRunner({baseURL, model, ledger})`.
  `LocalRunner({ledger})` fixes the section 4 private model settings. Generic
  HTTP baseURL should include `/v1` when the server requires it. Codex uses the existing extraction-only CLI
  route/model/effort and environment allowlist, with tools disabled.
- `one-shot.cjs`: `oneShot({html, evidence, runner, ledger, site, pagePaths})` uses
  the exact October system prompt, `modelInputText`, and 1,024-token output bound.
  It returns the uncompiled October candidate for the owning harness to replay.
  P2 deliberately retains October's HTML-input behavior; it is not a de-identified
  v3 input. Tests enforce byte-identical prompt/input construction.

## Gate details and accounting conventions

Substantive blocks are the declared tags, >=40 NFKC-normalized characters, link
density <0.5, outside core NOISE/navigation. Complete normalized block texts and
their multiplicity determine coverage, avoiding accidental substring credit.
Nested substantive blocks participate in character-weighted coverage separately.
Repeat means the complete normalized text occurs on at least two induction pages.
Single-page P3 never receives repeat evidence. G4 checks each exclusion against all
unique substantive blocks on the source page, including outside selected regions.

Section 7a supersedes run 1's ratio gate: use-time coverage of substantive
non-sidebar blocks must be >=60%, with hostname, anchors, G1, G2 and scaled G5.
G3 remains 90% (P4) / 80% (P3), excluding sidebar blocks; G4 permits sidebar,
link-density >=0.3 and under-40-character exclusions. G5 is the declared
min(200, half the page's substantive characters). The old ratio helper remains
available for diagnostic callers but does not participate in verdicts.
Only the first nonempty source H1 is checked, following the design's singular H1.

Minor decisions for run 2 (no threshold/policy changes):

- Host binding is `applicability.hostname`, the exact lower-case URL hostname without ports or aliases, so deployment and replay use one canonical field.
- Nonempty `[id=...]`, `[class=...]` and `[class~=...]` anchors count like CSS id/class tokens, because they express the same identity constraint; dots inside unrelated attribute values do not count.
- Non-sidebar coverage removes sidebar descendants from ancestor block text too, so an enclosing TD cannot accidentally protect a sidebar that section 7a permits excluding.
- Historical run 2 used summed block weights for G5; review fix 8 supersedes that with the union of substantive source subtrees, counting each character once. A page with zero substantive characters retains the declared zero floor.
- Bounded history has three messages: system, immutable initial outlines, and one user message containing one-line JSON records of earlier actions plus only the latest observation; invalid response bodies are not echoed.
- Local fallback is selected through `/models` preflight on connection failure only, before generation, so an unknown generation outcome is never replayed to the fallback address.
- Local replay defaults to two concurrent sites (never more than four requests) to limit retained jsdom memory while inference is pending.
- A P4 site needs its original p1+p2; redirected captures are skipped without substituting held-out pages, preserving the induction split.
- Basic-reader fallback output is cached by source and procedure-core raw-byte hashes, avoiding repeated large-DOM work without changing output.
- Pilot tuning recommends the first preview by turn 4 and warns against duplicating an H1 already inside a body region, because run 2's first local trial never previewed its invalid title selector and DeepSeek duplicated a title.
- Invalid draft references are reported as scoring errors with empty-unit ids; they are never filtered or edited to manufacture metrics, because reference ownership and scoring denominators belong to WP-A/WP-B.
- Missing provider usage is marked unknown rather than inferred from characters; the local endpoint omitted usage in the pilot.
- Cross-process ledger contention waits at most 240 ms before refusing, because three development policies can finish requests together; provider requests themselves are never retried.

Local settings are exactly `http://claude-host:8780/v1`, fallback
`http://100.106.192.82:8780/v1`, `Qwen3.8-27B-abliterated`, bearer `local`,
`chat_template_kwargs.enable_thinking=false`, 30-minute timeout and a shared
four-request semaphore. JSON is serialized by Node in UTF-8. Service-not-running
or would-not-start responses halt the local batch and are never retried.

All paid calls go through `Ledger.run`; direct DeepSeek `generate` calls also
enter that guard. The default ledger/payload paths are the design's shared paths.
Append-only request/result/assessment/refusal events are joined by id when reading
totals. Limits are $5 / 2,000 total paid requests / 250 total paid development
requests, retaining all prior attempts. Section 9 raises the development cap to
450 for run 3 (146 already used); total request and dollar caps remain unchanged.
Every start counts, even after a crash; unknown usage retains a conservative
peak-rate reservation. Concurrent starts cannot overrun caps. The guard also
reserves worst-case output cost, so it can stop slightly before $5 rather than
overspend. Locks are archived; a stale lock refuses transport and requires an
operator to inspect it. No ledger reset or automatic retry is provided.

Prices are the official Flash peak/off-peak USD list prices verified 2026-11-20;
each start records its source and rate tier. Chinese weekday holidays are charged
at the conservative peak estimate. Completion usage includes thinking tokens as
reported by DeepSeek. Missing/invalid usage is visibly marked as an estimate.
Codex/pc11 are logged but do not consume DeepSeek limits. This worker's paid route
refuses evaluation policy/paths entirely; evaluation needs separately authorized
coordinator handling. Supply real source `pagePaths` for audit and split checks.

## Verification and development replay

`node --test tests/revision/agent` runs offline tests only. They use jsdom,
scripted runners and provider/CLI doubles, with isolated ledgers under ignored
`workspace/revision/dev-runs/tests`. The directory entry point supports Node 22.

`node backend/agent/develop.cjs --site=dev-02` is PAID development inference.
It checks frozen source hashes, induces on p1+p2, and applies to p3-p5 with
use-time checks and explicit reader fallback. Results are immutable, timestamped
under `workspace/revision/dev-runs/development`. The corpus/reference trees remain
read-only. The replay parser removes NOISE stylesheet nodes with parse5 before
jsdom CSS parsing (valid Wikipedia border/var() declarations crash cssstyle).
Source bytes/hashes remain unchanged. It recognizes `corpus/dev-manifest.json` as well
as the requested `corpus/dev/dev-manifest.json`; until either exists it uses an
explicit October development allowlist. October has only two pages per site, so
those preliminary trials have no p3-p5 transfer evidence. `--thinking` enables
Flash thinking; it does not change the gate or allowance.

Run 2 uses `node backend/agent/run2.cjs --provider=deepseek --mode=P4`,
`--provider=local --mode=P4`, or `--provider=deepseek --mode=P3`.
Optional `--site=dev-02`, `--concurrency=2` (local only), and an absolute ISO
`--deadline=...` bound the run. Evidence goes to `workspace/revision/dev-runs/run2`;
references are read only after generation for the owning scorer's per-page
content recall/noise leakage. Every admitted rule records excluded selectors,
per-induction-page match counts and the first redacted cue.

Run 1 generated files were moved to `workspace/revision/dev-runs/archive` with
old/new paths and hashes in migration receipts. The supplemental receipt records
raw-byte SHA256; the original equality receipt used canonical JSON Buffer encoding.

`node backend/agent/audit.cjs` verifies saved payload hashes and counts residual
email/phone/URL/digit-run/handle patterns in every request. Structural counts,
node ids, system-prompt examples and provider-generated selector syntax can
produce residual matches; counts are evidence for inspection, not a privacy
guarantee. Names/free text remain by design. No DOM HTML is sent by the v3 loop.

## Capability programme (run 3)

Run 7 conventions: `REVISION_BASELINE_CACHE` selects a fresh directory under
revision/dev-runs, so every capture is rerun once before sharing its baseline
seeds across model policies. After the coordinator's resume, the approved hard
development cap is 700 and ordinary run guards stop at 670, reserving 30 for
confirmation. Only thinking-off P4 is tuned; other variants run with final views.
Progress requires no
loss of primary unit content recall; the first iteration compares against the
better clean/noise baseline, so two ties with the baselines stop the programme.
Subsequent tuning compares against the best P4 configuration, including when
that configuration trades clean pass against a baseline's lower noise; otherwise
a real P4-to-P4 improvement would be mistaken for a plateau. A tuning plateau
stops refinement, while the required final variants still run once.

Run 7 view refinement: initial sourceSelectors and zero-match alternatives are
observed non-positional selectors, each unique on every induction page. They are
evidence for the model, never automatic rule repairs. Optional-singleton transfer
failures motivate optional multiple regions or broader stable source containers.
The W3C performance change sanitizes once per inventory, caches subtree text/link
measurements, skips empty coverage work, and avoids cloning unrelated G4 blocks;
thresholds, source ordering, sanitization and duplicate-occurrence accounting stay
the same, tested against the previous measurement algorithm.

`capability-run.cjs` prepares a frozen valid-reference paired cohort and P0/P1
outputs, creates named prompt iterations, runs `P4-off`, `P4-on`, `P4-local`, and
fresh `P3`, and invokes the owning harness's `scoreboard.cjs`. Files follow its
`<pageId>-<policy>.html` plus `rows.jsonl` contract under revision/results;
trials, source snapshots and diagnostics stay under revision/dev-runs/capability.
No archived acceptance script or evaluation page is used.

Minor conventions implementing section 6a:

- P0/P1 are the existing policy entry points, isolated in bounded children and cached by source, URL and implementation hashes; P0's declared 120-second timeout is counted, never replaced by a different algorithm.
- Baseline containers use observed output-root selectors where available, otherwise the explicitly labelled source LCA of preserved substantive blocks; synthetic Readability wrappers are never represented as observed source selectors.
- Baseline outlines and the source outline share the 12,000-character cue budget per page. G6 chooses by unique non-sidebar character coverage, breaks ties toward P0, and requires explicit baseline evidence; two actual baseline failures yield no protected blocks, with failures retained in diagnostics.
- G6 is an induction gate. Browser use-time selection continues to use hostname, anchors, G1/G2/G5 and the 60% floor; it does not run a Node-only baseline inside the browser.
- Suspicion output is informational: at most 40 kept/dropped entries, high link density uses the existing 0.5 substantive boundary, and cues are redacted. Neither suspicions nor suggestions repair the rule.
- Selector suggestions resolve to one original ambiguous match on every induction page; at most three distinct targets are returned. Only observed id/class/role/itemprop/component/test-id/aria-label constraints are used, without positional selectors or redaction-altered values.
- Families are separate admitted induction episodes under one host, with distinct anchor signatures. More matching anchors take precedence, then insertion order; if that selected rule fails use-time, the result is fallback, not a search for a convenient output. Refining the same anchor signature replaces its active in-memory entry; trial evidence is append-only.
- The main paired cohort requires valid same-host p1+p2 and a valid held-out reference. P3 runs fresh on every valid p3-p5, matching the policy definition; unusable inputs are listed before generation, never dropped based on a policy outcome.
- Shared P4 generation accounting is charged once on the first held-out row, not once per transfer. All policy failures retain delivered P0 fallback and remain failures of their own rule.
- Progress means a Pareto improvement in clean-pass rate and mean noise leakage (one strict, neither worse) against the previous best development configuration on the same frozen cohort. The target requires strict improvement over both P0 and P1 on both measures. Two consecutive non-improving iterations stop the programme; no threshold is relaxed.
- A zero-valid-reference cohort is a hard blocker before paid generation, not a zero-score iteration. The older capture checker and the stronger shared harness validator are both respected; source/extractor mismatches and duplicate annotations are never repaired inside this package.

## Review fixes (items 7–12)

- Live loops take `pageIds`, never caller documents. `PageRegistry` resolves each id from the canonical development manifest, verifies bytes and real paths inside corpus/dev, and rejects redirects outside the declared host. The ledger independently resolves those ids before every request, including unpaid models; optional path strings are ignored. Live baseline seeds are regenerated from those same ids. Evaluation is refused for every provider: no coordinator-approved freeze format has been issued, and file existence alone grants nothing.
- Offline scripted tests may use synthetic DOMs; transport tests use a test project root containing a real canonical-shape manifest. Boundary regression tests call the unwrapped production ledger, so test convenience defaults cannot mask missing-id refusals.
- G5 counts the union of substantive source subtrees. Coverage compares normalized text across every output element type; identical ancestor wrappers are one physical occurrence, while distinct source sibling occurrences still require distinct output occurrences. This admits preserved SPAN selections without tag-dependent credit or duplicate wrapper credit.
- The v3 sanitizer intentionally exceeds frozen core semantics for form controls and srcset: option contents/selection, input/textarea values and button value attributes are cleared; button labels remain. Every srcset candidate is independently validated and resolved, retaining HTTP(S) and data:image only. Original-node mapping survives controls whose descendants are cleared.
- Privacy and audit share international-phone and Unicode-decimal-digit patterns; bare domains with path, query or fragment are reduced to their host. The review examples are regression tests, not just pattern self-comparisons.
- Historical one-shot calls also need a canonical `pageId`; live caller HTML/evidence is not trusted. The original prompt and model-input formatter remain unchanged. Any future manifest-bound prepared October sample route must be specified before evaluation is enabled.

## Consented runtime API (run 5)

`runtime.cjs` exports `issueConsent(tab, page)`,
`registerRuntimeExample(token, host, sanitizedHtml)`, and
`runRuntimeInduction(host, [id1, id2], runner)`. The final call returns the existing
loop verdict (`accepted`, rule, gate, reasons, turns, accounting). It uses P4 and
the same six-turn protocol, views, redaction and deterministic gate.

```js
const { createRuntimeAgent } = require('./agent/runtime.cjs');
const runtime = createRuntimeAgent(); // once per backend session, not per HTTP request
const page = { url: 'https://example.org/article', sanitizedHtml: suppliedSnapshot };
const token = runtime.issueConsent(tabId, page);
// Only the side panel's explicit consent submission calls this operation:
const id = runtime.registerRuntimeExample(token, 'example.org', page.sanitizedHtml);
// Collect two distinct consented pages, then explicitly request induction:
const verdict = await runtime.runRuntimeInduction('example.org', [id1, id2], runner);
```

The backend must obtain the tab and URL from its trusted extension request route;
these functions do not establish HTTP origin authentication or infer user consent.
`page` has exactly `url` and `sanitizedHtml`; it never has a path. Tokens are random,
memory-only, one-use and bound to tab, URL, host and the exact submitted snapshot.
Issuing another token for the same tab revokes its earlier token. A mismatched
registration consumes its token. Backend restart invalidates outstanding tokens;
registered examples remain local and may be reused.

Examples are re-sanitized into immutable generated-ID JSON records under
`workspace/local-ai/runtime-examples/`. Only those IDs resolve. Runtime never
resolves a caller path, corpus ID, or caller baseline; linked paths escaping the
store are refused. While the study runs, every hostname in the evaluation
manifest (including evaluation entries of the combined manifest) is refused,
regardless of path, query or fragment. At consent, registration, load and request,
normalized-text SHA-256 fingerprints use `tests/revision/eval/text.cjs` on both
runtime input and every corpus capture, including dev and archived captures.
Complete-document text and its runtime-sanitized BODY projection are both indexed,
so stripping scripts, forms or NOISE cannot turn a capture into an eligible copy.
Byte-hash refusals are retained as an additional check. Fingerprints are cached
per source's size, modification/change timestamps and inode; source discovery and
manifest host checks run again before each request. The hash-only index persists
under local-ai and is invalidated by extractor/sanitizer code changes. A local
worker builds changed entries in batches of at most 32 with a 1-GiB heap and a
five-minute timeout per batch, yielding between closed DOMs to avoid retaining
the whole corpus in the backend. Text-excluded subtrees and inline CSS are stripped
after parsing, since neither shared text extraction nor the sanitizer's text
projection uses them; this avoids building irrelevant CSSOM state. A failed
or changing-source build refuses the request. No corpus text reaches a model.
No evaluation freeze is implied. The development registry and study guard remain
unchanged, and continue to refuse runtime IDs and evaluation policies.

Each attempted provider turn consumes the interactive session limit (default 20,
`LOCAL_AI_MAX_CALLS` 1..20), including failed turns; a guard refusal consumes none.
`RuntimeSession` enforces one active transport. Its state spans all runtime hosts
and providers. When the backend also serves legacy/v2 generation, instantiate
`createRuntimeAgent({session})` with a synchronous `acquire()/release()` adapter
to that backend's **same** counter and busy guard. `acquire` must reserve one call
or throw; `release` releases the active slot without refunding it. Budget errors
from existing HTTP-429 guards are normalized before the loop counts a request.
The API leaves backend HTTP wiring to WP-D; it does not edit `local-ai.cjs`.

Started/completed/failed entries and rule assessments append to the existing
`workspace/local-ai/<provider>-<model>/usage.jsonl` route with `policy:runtime`
and `protocol:3`; sanitized baseline caches also stay under local-ai. No runtime
request reads or appends the study ledger, spends a study request allowance, or
saves evidence under revision/payloads.

Minor conventions: consent binds exact bytes because the registration signature
has no second URL/tab argument; two examples must have distinct URLs and sanitized
hashes to provide repeat evidence; the local 1-MiB HTML ceiling matches the existing
decoded-validation bound. A shared session adapter keeps the owning backend's
legacy and v3 requests under one limit without changing another package's files.
