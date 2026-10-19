# TASK-023 local checks

These entry points do not load credentials, start the backend, call providers, or access Firebase. Do not run the legacy suites as a group.

Windows setup (existing Node dependencies; Python uses only its standard library):

```powershell
python -m venv --without-pip .venv
npm run test:local
npm run benchmark:local
```

On macOS/Linux use the same commands; the runner selects `.venv/bin/python`.
Outputs are incremental under ignored `workspace/task023/`. `--limit=5` bounds a pilot:

```powershell
npm run benchmark:local -- --limit=5
```

The harness evaluates the actual production content-script and background message handlers with local Chrome/provider doubles. It loads only `validateExtractionDOM` from backend source by explicit function boundaries, without evaluating backend startup/configuration. No extraction/scoring algorithms are copied. The panel tests execute the production sidepanel callback and assert verification payloads and bounded fallback behavior.

`corpus.py` uses Python's MIME parser. The root is selected by multipart `start`, matching snapshot Content-Location, then the first MIME root part; ambiguous roots are excluded. Transfer decoding precedes strict declared/meta charset decoding. Every capture records its original SHA-256, URL, date, HTML-part count and selection rationale.

The three approaches are fresh per-page AI, shared reusable rules and general local fallback. Fresh AI is unavailable without separate provider authorization. Existing `good_rules.json` rules are authored fixtures with no established model-output provenance; they test rule reuse mechanics only. Unmapped rules remain unavailable. Failed fixture selectors are explicitly identified as fallback output.

The three measures are provisional content outcome, all AI generation/refresh/retry calls (including failures), and local delay. Content references contain the first 30 heading/paragraph/list anchors in a semantic main/article region (or body), clipped to 300 characters each. Complete means all these anchors are retained, partial means some, failure means none or no usable anchors. These are agent-generated provisional references requiring parent inspection; they are not ground truth, whole-page quality, accessibility or user-benefit evidence. The unchanged production DOM score is diagnostic, not another outcome measure or validated reference.

Timing is the median of three Node/JSDOM production `EXTRACT_CONTEXT` calls plus disconnected reader HTML assignment. Source DOM parsing is excluded. Chrome messaging is doubled; no Chrome rendering, network latency, provider token/cost or user performance inference is valid. Every benchmark records Node/JSDOM/OS/CPU and source hash. Keep timing runs sequential on the same environment when comparing.

`--resume` resumes measured pages from the incremental JSON and references. `--skip-score` omits the optional DOM-confidence diagnostic (two extra DOM parses per measured row), preserving all three required measures and three extraction repeats. The pilot artifacts include the unchanged production diagnostic; the bounded public continuation may omit it. Neither flag changes content references or extraction behavior.

For large public HTML documents, use a sequential process bound rather than waiting indefinitely for synchronous JSDOM work:

```powershell
.venv/Scripts/python.exe tests/local/bounded_benchmark.py --seconds 480 --per-page 30
.venv/Scripts/python.exe tests/local/summarize.py
```

Each page runs the same production benchmark with three repeats in its own local Node process. Startup and source DOM parsing remain excluded from the measured delay. Timeouts are recorded separately as unavailable measurements, never content failures or successful low delay. Already measured pages are resumed. No fetches occur. The eight-minute total default is a benchmark bound, separate from collection limits.

Public collection is explicit and separate, requiring authorization/logging through the owning workflow:

```powershell
.venv/Scripts/python.exe tests/local/corpus.py --fetch 30
node --expose-gc tests/local/benchmark.cjs --public
```

At most two URLs per candidate site, 3 workers, 12-second request timeout, 3MB cap, no retries, no login/session/cookies or access-control bypass. The pair URLs are the public capture URL and hostname root. Both are fetched contemporaneously; historical captures are separate, never passed off as contemporaneous partners. HTTP failures, detected bot pages, same-final-URL pairs and unavailable pages remain recorded. Two successful different URLs are candidate pairs until access/content inspection. Do not repeat the fetch command without renewing the batch bound/logging as appropriate.

Regression scenarios cover missing rule, service unavailable and stale/missing selector. Provider doubles verify control flow/call counts only. No mocked result is a fresh AI quality measurement. Parent owns native code review, Chrome checks and integration.


Parent review corrections: verification uses the complete original body only when it fits the verifier's5,000-character model-context bound. A large head is excluded; an oversized body is marked unavailable rather than truncated. The panel discards verification responses whose URL or hostname changed. These guards avoid refining a working shared rule using incomplete or unrelated page context.

The cache-failure double follows FirebaseService.getRule and resolves null. This is indistinguishable from a cache miss to the current caller, so a mocked analysis attempt can occur; the tests do not guarantee zero provider requests during a real cache outage.

Resuming now rejects a changed source/protocol/runtime rather than relabeling old measurements. Frozen worker benchmarks predate the parent review corrections and remain unchanged. Use a new safe output tag, for example --tag=parent-pilot, to retain a separate result set. Never overwrite old evidence merely to satisfy a provenance check.
