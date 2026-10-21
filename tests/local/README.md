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


## Shared preservation procedure checks

`preservation-core-test.cjs` exercises the shared browser/Node DOM core and runs in
`test:local`. `preservation-native.cjs` additionally launches an isolated headless
Chrome with messaging doubles and no site requests; set `PRESERVATION_CHROME` to
an alternate Chrome executable. Its subprocess has a 90-second hard timeout.
The native checks include delivery provenance and the panel checks ensure an
already delivered procedure does not trigger repeated analysis.

Schema v2 declares nonoverlapping reading regions, exclusions, coarse structural
preconditions and compilation adjustments. Applying a fixed procedure checks the
current full DOM and rejects missing reading roles; it never augments the output
at runtime. Compile-time added regions are reported separately from runtime
fallback and from unadjusted model selection. This is an empirical reading-task
guard; application interactions, CSS-generated content and user outcomes are not
verified. Server analysis samples remain explicitly incomplete source context.


The local v2 route uses `GET /rules/<host>?protocol=2` and protocol-2 analyze/report
requests. It keeps a separate private `procedures-v2` namespace; a legacy host
rule is not multi-example admission. One bounded legacy model candidate remains
provisional after its first complete sanitized reading example. A second distinct
identity AND content example must pass the same fixed procedure before publication.
Client identity hashes omit URL fragments and preserve queries; these identifiers
are local prototype evidence, not trusted attestations. Family identity is derived
on the server from versioned outermost semantic landmarks, without text or URLs.

Analysis stays capped at 30,000 model-input characters. Complete validation is a
separate complete client-sanitized BODY (including outside reading regions, original
BODY tag/attributes and resolved destinations); oversized bodies are never pruned.
It is
subject to the existing 100,000-character and 262,144-byte request limits. Inputs
and textarea values are cleared client-side. Incomplete/unusable contexts, cache
lookup outages, failed matching families and unsupported essential material retain
the basic view without another automatic runner call. Form application behavior
is not verified. Both protocols share one session generation cap/concurrency bound.

`procedure-admission-test.cjs` runs in `test:local`; it uses an ephemeral API and
fake runner. `procedure-browser-test.cjs` additionally verifies the production
content/background/service path in isolated Chromium, including privacy, live DOM
updates during cache lookup and lookup-failure behavior. Saved development replay
scripts require frozen source hashes; cold admission and GET-only warm reuse are
separate resubstitution reports, never unseen performance or new generation.
