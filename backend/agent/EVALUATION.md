# Frozen evaluation harness

## Freeze v3 and full evaluation (coordinator decision,2026-11-21)

The host equivalence rule removes exactly one leading `www.` and otherwise compares
unchanged hostnames. It applies to development/evaluation PageRegistry validation,
development source/readiness allowlists, v3 hostname applicability/use-time validation,
and family storage/lookup. Other subdomains, suffixes and repeated www labels are not folded.
The system prompt, outline, thresholds, references, captures, compiler and scorer measures
are unchanged. The v3 implementation hash is updated only for this explicit host exception.
Scorer observation/site identity checks are not redirect guards and remain exact; runtime
consent/active-page checks remain exact because they bind a specific consented URL.

V2 loader records for all five eval-02 pages were saved before changes. V3 carry records
verify full JSON record bytes/hashes are identical and preserve every sample output and
all31 sample requests. V2 freeze/manifest and original changed source bytes are archived
with verified hashes; originals reconstructed by the inverse source patch were accepted
only when byte-for-byte SHA-256 equalled v2's inventory. Exact diff hashes are logged.

The full campaign uses a single Node process with per-site/policy directories and a
serialized synchronous ledger reservation. Six concurrent asynchronous guard calls are
tested against a lowered paid cap: pending requests count before transport and the cap
cannot be overrun. DeepSeek agent site concurrency2, local concurrency2 (within its cap4),
Codex concurrency1, baseline concurrency3. Legacy P2/replay stays sequential because its
bounded compiler blocks the Node event loop; sites with any capture over1MB also run
alone for agent policies. These scheduling limits avoid delaying another site's provider
callbacks during large synchronous DOM operations. Every paid runner
lowers its ledger request cap to1990; no queued job starts paid inference once reached.
Policies then receive explicit budget-failure rows without dropping their denominators.

Order: P0,P1,P4-on (pause after the first five fresh sites for content/fault inspection),
P2 fresh/shared and their saved-candidate replays,P3(p3 only),P4-off,cue0,full,local,Codex,
then seeded applicability. Codex uses only the predeclared eval-01..eval-10 subset.
Completed site/policies are never rerun. Incomplete requests retain their failed charges.
The campaign driver and report driver are hash-bound in the campaign state before v3;
they call the frozen harness/scorer and may not be edited after issuance.

## Freeze v2 coordinator decision (2026-11-21)

The coordinator authorized exactly two frozen source changes after the v1 stop:
`policies/p1-readability.cjs` now renders escaped Readability title/byline metadata,
skipping the added title only when the first content heading has the same NFKC/whitespace
normalized text; `eval-score.cjs` now takes policy/site request, token, cost and wall-time
accounting from site completion receipts verified against the run's ledger, independently
of the held-out quality cohort. Scoring measures, thresholds, prompt, gate and outlines
are unchanged. Regression assertions were added to the unfrozen agent evaluation test.

V1 is superseded, not deleted. Its original freeze/manifest and the two old source files
are preserved under `workspace/revision/freeze/archive/v1/`. `FREEZE-LOG.md` records both
freeze hashes, source before/after hashes, exact diff hashes and archive paths.

The 36-page development P1 re-score uses only local Readability; P0 and P4-on rows/HTML
are copied unchanged from `run7-final-score-1795249695783`. No model requests are made.

Eligible eval-02 outputs (P0, P2 fresh/shared and both P2-nr variants) are copied into new
v2-bound output directories. Each carry record lists both freeze hashes, original output,
row and site-receipt hashes, and the unchanged file hashes covering their generating code.
Original v1 evidence remains untouched. Site receipts retain original timing/accounting;
the run keeps the original experiment key so its existing ledger requests are verified,
never re-charged. P1 is rerun locally. The unfinished v1 P3 has zero requests and is retained;
P3/P4 run freshly under v2. No source file may change after v2 is issued.

The coordinator explicitly permits another site's held-out DOM for the applicability
pass only; no model receives that foreign page. The seeded cross-site check is now run
after eval-02's P4-on trial. Sample orchestration for the resumed v2 operation lives in
the bounded `workspace/revision/evaluation/v2/` folder; it calls the frozen harness.

The evaluation entry points do not tune prompts, gates, compiler logic or measures.
Use the retained run-7 prompt file, including its iteration-2 guidance. The base
`loop.cjs` SYSTEM_PROMPT alone is not the retained prompt.

Before any real freeze:

```
node backend/agent/eval-run.cjs check
node backend/agent/eval-run.cjs freeze <printed-check-receipt.json>
node backend/agent/eval-run.cjs verify
```

The check receipt binds all evaluation source bytes. Freeze creation requires all
200 current lint receipts, verifies the settled three hashes, writes an evaluation-only
manifest and the freeze with exclusive creation, then appends a `freeze` ledger event.
The event records the freeze's own SHA-256 and does not count as a request. Every
evaluation page load and guarded request validates every listed file, the ledger receipt,
the manifest boundary and the requested capture's SHA-256. Development paths are unchanged.
The frozen source inventory is conservative: every agent CJS and scorer/policy CJS,
the v2/v3 cores, provider helpers, package manifests, retained prompt, corpus manifests,
references and lint receipts. Editing any frozen source closes evaluation access.

Run a named policy on explicitly named sites:

```
node backend/agent/eval-run.cjs run P4-on eval-02,eval-03
node backend/agent/eval-run.cjs run P2-fresh eval-02
node backend/agent/eval-run.cjs run P2-nr-fresh eval-02 --source=<P2-fresh-directory>
node backend/agent/eval-run.cjs run P4-on eval-02,eval-03 --resume=<original-directory>
```

Policies: P0, P1, P2-fresh, P2-shared, P2-nr-fresh, P2-nr-shared, P3,
P4-on, P4-off, P4-cue0, P4-full, P4-local, P4-Codex. All sites run sequentially;
the existing ledger lock guards reservation/settlement but has a short contention timeout.
P3 uses thinking off and p3 only, matching run 7. Cue ablations use thinking on.
Codex uses the extraction-only transport with gpt-6.1-sol, medium effort, on the fixed
eval-01 through eval-10 subset. Local requests retain the existing four-request limiter.
No failed inference is automatically retried.

Each run has immutable configuration, HTML and JSONL output rows, plus site start,
trial/candidates and completion receipts. Never start a new directory to resume old work.
The original site list and freeze must match. A completed site is skipped without inference.
After interruption, an owner PID must be dead before a lock is archived. Started requests
are settled as interrupted failures at reserved cost; incomplete site outputs become failures
without regenerating any candidate. P2-nr replays saved raw candidates, including failures,
with zero new requests. Shared P2 compiles on p1 and delivers p2-p5; only p3-p5 enters the
held-out comparison. Per-site wall time is in `sites/<site>/complete.json`; output rows also
carry latency and accounting. A missing requested output causes scoring to refuse.

```
node backend/agent/eval-score.cjs eval-02 <policy-output-directory> [...]
node backend/agent/eval-applicability.cjs <P4-on-directory> eval-02,eval-03
```

Scoring calls the unchanged frozen scorer/statistics implementation, not copied measures.
It writes all-site and without-mixedFamily summaries, audited-reference summaries when
available, failures by reason, 10,000 site-bootstrap resamples and P4-on minus P0/P1/P2 fresh/
P2 shared/P3 paired differences. P3 pairing uses common p3 pages only. One-site intervals are
degenerate. Applicability is a separate stress test using a seeded 40-site derangement and
one held-out p3 per target site; it records declined/fallback decisions without inference.
Non-admitted source rules are reported as unavailable, not successful declines.

`eval-sample.cjs` orchestrates only eval-02, persists run-directory pointers before requests,
records service operations locally, inspects page/policy/prompt/ledger bindings and writes a
content digest plus score/timing receipts. It deliberately does not read another site's DOM;
therefore the real cross-site applicability sample is deferred and explicitly reported.
It must not be presented as a completed real cross-site applicability measurement.

After a freeze, do not edit a frozen file to fix a discovered problem. Stop and report the
file and reason. Do not regenerate the sample when continuing the remaining evaluation.

V2 issued 2026-11-21T10:26:00.162Z: SHA-256 370a379bfbb98e48a69a4f688e1757c8ec1b598b145b9a3c0941d1da7bbc770d. V1 2dc120e99ae4d0ea2d19a8e79c01151b63d17adfad04c7093817b125b9860b27; archive/diff evidence in workspace/revision/freeze/FREEZE-LOG.md.

- backend/agent/eval-score.cjs: before b8f3433c37d424e3f56c2bf3e68d1f5cdf7821f50e0f9a27313331935a9585c1; after f79003505449354dc9c941707f508c7d3c3ffc9055e12b635527430ae3e94db2; exact diff SHA-256 d4bd97e0bf8335db11f3486a4827b61791146bf870ce14ae21275ae5186cc23d (workspace/revision/freeze/archive/v1/eval-score.cjs.diff).
- tests/revision/eval/policies/p1-readability.cjs: before f93fa357bf3e52a91bbad9f146971d648e0963ac9481a861a619c43515df6c6a; after cc7307f4094b2c0b1cabf71aadbcd12f24cf3b716e3a6281f11532abd2a67005; exact diff SHA-256 220158a502695c8417f42f0c2f84d849d226fd5c36e55f2d9d1223bbd50a99a1 (workspace/revision/freeze/archive/v1/p1-readability.cjs.diff).
- Archive move workspace/revision/freeze/evaluation-freeze.json -> workspace/revision/freeze/archive/v1/evaluation-freeze.json; unchanged SHA-256 2dc120e99ae4d0ea2d19a8e79c01151b63d17adfad04c7093817b125b9860b27.
- Archive move workspace/revision/freeze/evaluation-manifest.json -> workspace/revision/freeze/archive/v1/evaluation-manifest.json; unchanged SHA-256 1a37f40d39de8b7a02ffbdb8f7fb59f703804c0a3705bc14a2ee36855f7af290.

## V2 sample closeout — 2026-11-21T10:37:29.989Z

V2 remains valid and unchanged: 370a379bfbb98e48a69a4f688e1757c8ec1b598b145b9a3c0941d1da7bbc770d. All 13 generation policies completed. Applicability STOPPED on evaluation-page-left-host:eval-19-p3: declared pololu.com, captured www.pololu.com. No foreign target was substituted and no frozen file was edited. Metadata-only inspection also found www mismatches on eval-08 and eval-18 (15 pages total). These need coordinator action before the remaining evaluation.

Tests before v2: 129/129 agent/eval and14/14 capture, zero skipped. Sample requests31 =22 DeepSeek +3 local +6 Codex; four carried,27 new. Sample DeepSeek cost $0.025941216. Global paid714/$0.516060882, pending0. No model requests after the applicability error. No reviews/commits/pushes/deployments.

### Development P1 re-score (36 pages /12 sites; zero requests)

| Policy | Clean | Complete | Recall | Noise | Noise chars | Title first | Own clean |
|---|---:|---:|---:|---:|---:|---:|---:|
| P0 | 0/36 | 35/36 | 97.17% | 68.46% | 15.50% | 31/36 | 0/36 |
| P1 | 7/36 | 17/36 | 84.30% | 19.91% | 9.28% | 5/36 | 7/36 |
| P4-on | 17/36 | 36/36 | 99.89% | 25.07% | 6.82% | 31/36 | 17/36 |

P4-on minus fixed P1, percentage points [95% site-clustered interval],10,000 resamples:
- cleanPass: 27.78 [-2.78, 61.11]
- completePass: 52.78 [27.78, 77.78]
- contentRecall: 15.59 [6.70, 26.75]
- noiseLeakage: 5.15 [-20.05, 25.39]
- noiseCharacterShare: -2.46 [-9.74, 2.88]
- titleFirst: 72.22 [47.22, 94.44]
- noFallbackPass: 27.78 [-2.78, 61.11]

### Eval-02 (P3 p3 only; all other quality cohorts p3-p5)

| Policy | Clean | Complete | Recall | Noise | Noise chars | Title first | Own clean | Requests | Seconds/site | Remaining requests |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P0 | 0/3 | 3/3 | 100.00% | 40.00% | 16.60% | 3/3 | 0/3 | 0 | 16.415 | 0 |
| P1 | 0/3 | 0/3 | 92.76% | 20.00% | 3.07% | 0/3 | 0/3 | 0 | 10.125 | 0 |
| P2-fresh | 0/3 | 3/3 | 100.00% | 40.00% | 16.62% | 3/3 | 0/3 | 3 | 52.929 | 117 |
| P2-shared | 0/3 | 3/3 | 100.00% | 40.00% | 16.62% | 3/3 | 0/3 | 1 | 30.879 | 39 |
| P2-nr-fresh | 3/3 | 3/3 | 100.00% | 20.00% | 3.02% | 3/3 | 3/3 | 0 | 13.793 | 0 |
| P2-nr-shared | 3/3 | 3/3 | 100.00% | 20.00% | 2.99% | 3/3 | 3/3 | 0 | 13.641 | 0 |
| P3 | 1/1 | 1/1 | 100.00% | 20.00% | 1.15% | 1/1 | 1/1 | 3 | 24.050 | 117 |
| P4-on | 0/3 | 0/3 | 85.26% | 0.00% | 3.46% | 0/3 | 0/3 | 5 | 59.693 | 195 |
| P4-off | 3/3 | 3/3 | 100.00% | 20.00% | 2.99% | 3/3 | 3/3 | 3 | 18.377 | 117 |
| P4-cue0 | 3/3 | 3/3 | 100.00% | 20.00% | 2.99% | 3/3 | 3/3 | 3 | 34.847 | 117 |
| P4-full | 3/3 | 3/3 | 100.00% | 20.00% | 2.99% | 3/3 | 3/3 | 4 | 67.884 | 156 |
| P4-local | 3/3 | 3/3 | 100.00% | 20.00% | 3.10% | 3/3 | 3/3 | 3 | 56.530 | 117 |
| P4-Codex | 3/3 | 3/3 | 100.00% | 20.00% | 2.99% | 3/3 | 3/3 | 6 | 62.681 | 54 |

Measured extrapolation after resolving the hostname boundary: one site/request at a time,858 paid requests +117 local +54 Codex (Codex nine remaining sites),1,029 model requests total. Policy execution 268.9minutes =4.48hours. This excludes applicability (blocked/unmeasured) and final full-corpus scoring, and is a one-site extrapolation, not a performance guarantee. Paid headroom1,286 requests.

P4-on excluded details and lost required material:85.26% recall /0 clean. Other P4 variants:100% recall /3 clean, but local output duplicates its title. All measures unchanged. The one-site score has degenerate bootstrap intervals and cannot establish a population advantage.

Evidence: workspace\revision\evaluation\v2\report.json; source/diff/carry hashes above; development workspace\revision\results\dev-P1-fairness-1795256357249; evaluation workspace\revision\results\eval-score-1795257257606. Nothing is running.

## Freeze v3 — 2026-11-21T10:58:36.355Z

V2 370a379bfbb98e48a69a4f688e1757c8ec1b598b145b9a3c0941d1da7bbc770d superseded by V3 9c430042776170100b54484502cc495c3aa82fecdfedda512ffef4ec2b5c16df. Coordinator-authorized one-leading-www equivalence in loader, applicability/use-time and families; no other domain folding. Prompt, outline, thresholds, references, captures, P0/P1/P2/scorer measures unchanged.
- workspace/revision/freeze/evaluation-freeze.json -> workspace/revision/freeze/archive/v2/evaluation-freeze.json; unchanged SHA-256 370a379bfbb98e48a69a4f688e1757c8ec1b598b145b9a3c0941d1da7bbc770d
- workspace/revision/freeze/evaluation-manifest.json -> workspace/revision/freeze/archive/v2/evaluation-manifest.json; unchanged SHA-256 1a37f40d39de8b7a02ffbdb8f7fb59f703804c0a3705bc14a2ee36855f7af290
- backend/agent/pages.cjs: before a894a316aaf4887d6c3e70cc0e96707542b593ec0294ba43efea0d14cea240b2; after 4159acafa87e08eef42736b32365bcd252977b66f25a8a6b8cb236f8ff416648; exact diff workspace/revision/freeze/archive/v2/backend/agent/pages.cjs.diff SHA-256 6b70d4eb87fc3e584bbf2c572fe529279121722de5c7d6613720422b44732507
- extension/procedure-v3.js: before 316e7ba09358084bde7142c980eacce43298147090e8b7aad69f0aea6aa98b6a; after aee2e56324f297cc787f397c34058f8d2fc5c9761aa1924313ed89722a80b0e6; exact diff workspace/revision/freeze/archive/v2/extension/procedure-v3.js.diff SHA-256 668f69b231b6a2d61e432cbbd95fd2fe0f13ee0757fe9b3a4c9622beb6f326d6
- backend/agent/families.cjs: before ece7af9a31f04ff1e66e742b1c6de5774206b50e8fa9e0105b91fde6133b9408; after 39b4d3e871575fbef7eb31e9e7ff897405c776d8c0e40a161004c20f0d7ccb99; exact diff workspace/revision/freeze/archive/v2/backend/agent/families.cjs.diff SHA-256 a874df796b37150de3f3a522537128ced4a4606cd00d9111fd4e2e7158d0027a
- backend/agent/develop.cjs: before 037be347be0bc8838230237525f6b512db601157523e60ed7ac1e8876432184e; after b074f8b3fd4a190965b940fe7b2f740e0c7fddeabe6c22d5b5b4beef27355ddd; exact diff workspace/revision/freeze/archive/v2/backend/agent/develop.cjs.diff SHA-256 f4041aede9765558711d2ca7e3d2ac29d13d9c34a5e6038980425a02dfe4577c
- backend/agent/wait-corpus.cjs: before 48f4e5645fd80785c08ce097d60ff769488ee9a85f93391eddd8969416eb1ffa; after f3031e62a11adf13caa58f4196f0d4293d706f0a727418d7ddfb18ca990c4a50; exact diff workspace/revision/freeze/archive/v2/backend/agent/wait-corpus.cjs.diff SHA-256 b3240ac1c40f754b58c215b2c13572f0e6e4ebd8977f0b693478aede7624a595
- backend/agent/eval-freeze.cjs: before 7097c93c85401d0362e00eb3c80c6bb2d76958cb63dc0b65de7f4f4368719a60; after 696e8e6676ab61e6900bf9f2a9abf78b2287365964eb2d57154f90fa686736d2; exact diff workspace/revision/freeze/archive/v2/backend/agent/eval-freeze.cjs.diff SHA-256 0176f078766f6e805d563177490ca326a8435c2349143b6a0ba5d485d3cb62f8

Five eval-02 loader records are byte-identical: workspace/revision/evaluation/v3/loader-record-proof.json. All13 policy outputs and31 requests carried without regeneration. All200 canonical records pass resolution.
- P0: workspace/revision/results/eval-P0-v3-carry-1795258716200/carry.json; SHA-256 ba2e4a2759e3f78f9e569cc83204851d88dddb6d2be5ea2ab8b7330b684cd5ed
- P1: workspace/revision/results/eval-P1-v3-carry-1795258716215/carry.json; SHA-256 68aea2d47a2005f11ef81232dc7f805935558dbe1efee2f89bf7d577d12bc8e5
- P2-fresh: workspace/revision/results/eval-P2-fresh-v3-carry-1795258716226/carry.json; SHA-256 f9de4ad6df97c31afe41704ebabb59564f7c39bdabbc8a811107a2355b9a3a49
- P2-shared: workspace/revision/results/eval-P2-shared-v3-carry-1795258716238/carry.json; SHA-256 2e140ee6cf43a8f700c1180c79ecc2e1f2c4f06dc6596845b8991bb9c6edda8a
- P2-nr-fresh: workspace/revision/results/eval-P2-nr-fresh-v3-carry-1795258716252/carry.json; SHA-256 34dea134f455f340030c375bfbf4977b542ae063962a272af772ac9d675cea87
- P2-nr-shared: workspace/revision/results/eval-P2-nr-shared-v3-carry-1795258716264/carry.json; SHA-256 eea8ca09e667fe48639bd7cd07bc5d6e1fa67d2e88368cadc5224e0d3793954c
- P3: workspace/revision/results/eval-P3-v3-carry-1795258716278/carry.json; SHA-256 ed98ede48a697f0552d36f1976fa0a421cbf47c849bfaeb02b9e6a24ff69278f
- P4-on: workspace/revision/results/eval-P4-on-v3-carry-1795258716288/carry.json; SHA-256 87ce2c3d4096e7fd74a701b005ddf476f5e6a84c569830f98fe621f5568abd3e
- P4-off: workspace/revision/results/eval-P4-off-v3-carry-1795258716300/carry.json; SHA-256 21c0dafc516a7afca7ece988d59b6cba8b0e16ba8ed823ecd283e99171ec0da3
- P4-cue0: workspace/revision/results/eval-P4-cue0-v3-carry-1795258716311/carry.json; SHA-256 1397e18f7e3d76fdf622247c3f23f10592d4ccd9456968e1d43d4206ae801a26
- P4-full: workspace/revision/results/eval-P4-full-v3-carry-1795258716322/carry.json; SHA-256 96b92e1aa41e2f1373eb49d445397a396d2fc522b287c376ef764fee7aa19c52
- P4-local: workspace/revision/results/eval-P4-local-v3-carry-1795258716333/carry.json; SHA-256 3d2770975c5276bc2b77597c5eebf0b47843c126e5873ce64ce74c77058b6936
- P4-Codex: workspace/revision/results/eval-P4-Codex-v3-carry-1795258716344/carry.json; SHA-256 639b7756c58f342891f85d8121948159df9e3426d2e2a8d9c6efb5f5b9d5e981

Campaign drivers: {"campaign.cjs":"c5aaa1697f7eb68fc2c608e6b11cdb53b6bb7a29b15db598dce7cd05d996be3e","report.cjs":"b268a4a20f39ef52a4f367b9956d39b33fe82f46407197d3ea3f66433b7ce05d"}. Every paid runner lowers its ledger cap to1990. Concurrency {"baseline":3,"agent":2,"local":2,"codex":1,"legacy":1}, large captures exclusive. First-five fresh P4-on checkpoint required before widening. Deadline 2026-11-21T16:00:00Z.

## Full-evaluation closeout — operational block 2026-11-21T14:11:36.726Z

Freeze v3 remains unchanged 9c430042776170100b54484502cc495c3aa82fecdfedda512ffef4ec2b5c16df. Eleven policies are complete40/40 sites; local5/40 measured (four failed new calls plus accepted eval-02),Codex1/10 measured. Unrun:35 local,9 Codex. No new model calls after the local transport block.

Local first two calls failed provider-request-failed after321/324s; two active calls were interrupted and settled failed,never resent. Endpoint models facts advertise16k but are static UI metadata,not live context evidence. Repository service launcher defaults262k; live runtime context was not verified. Node22/Undici defaults header/body timeout300s,consistent with the failures despite the frozen outer30m local timeout; exact cause is masked. No client/server repair was attempted. Coordinator authorization is required before resuming local inference.

Partial report: workspace\revision\results\eval-v3-partial-score-1795269394298 /report.json andreport.md. SHA-256 524963d083b8e4bdaf1410ba61b40f1f6a146d150e15b3e1a7b789b703f2d19b. Emergency reporting adapter SHA-256 a552d31e97120df57f29621d76001f28e35e71ce3e5d801f2b76d2f0c8616956; it calls the unchanged frozen scorer/statistics and reports measured cohorts only,avoiding invented outcomes or time-cap labels for operationally unrun work. Every requested main paired comparison is complete over40 sites.

Audit: 1338 output hashes verified; all1048 request page/prompt/source bindings match;31 sample requests carried,1017 new. Evaluation paid1035,cost$1.134197466. Global ledger {"requests":1908,"paidRequests":1727,"devRequests":692,"dollars":1.624317132,"pending":0,"budgetRefusals":0,"promptTokens":16487758,"completionTokens":899448,"cachedTokens":9770624,"failures":511}. Zero pending; no guard refusals. Tests132+14 pass beforev3 and source hashes still match. No reviews/commits/pushes/deployments.

| Policy | Sites | Clean | Recall | Noise | No-fallback | Requests |
|---|---:|---:|---:|---:|---:|---:|
| P0 | 40/40 | 10.00% | 99.08% | 66.70% | 10.00% | 0 |
| P1 | 40/40 | 26.67% | 79.10% | 8.07% | 26.67% | 0 |
| P2-fresh | 40/40 | 5.00% | 61.59% | 41.49% | 5.00% | 120 |
| P2-shared | 40/40 | 3.33% | 49.15% | 35.75% | 3.33% | 40 |
| P2-nr-fresh | 40/40 | 21.67% | 66.17% | 22.08% | 21.67% | 0 |
| P2-nr-shared | 40/40 | 25.83% | 68.01% | 21.93% | 25.83% | 0 |
| P3 | 40/40 | 17.50% | 99.62% | 53.62% | 12.50% | 197 |
| P4-on | 40/40 | 26.67% | 98.02% | 39.98% | 22.50% | 154 |
| P4-off | 40/40 | 36.67% | 99.83% | 38.68% | 30.83% | 183 |
| P4-cue0 | 40/40 | 34.17% | 98.94% | 39.66% | 30.00% | 164 |
| P4-full | 40/40 | 31.67% | 98.26% | 44.37% | 27.50% | 177 |
| P4-local | 5/40 | 33.33% | 100.00% | 40.51% | 20.00% | 7 |
| P4-Codex | 1/10 | 100.00% | 100.00% | 20.00% | 100.00% | 6 |

P4-on vsP1: clean tie26.67%; recall98.02 vs79.10%; noise39.98 vs8.07%. P4-off clean36.67% is the strongest completed point estimate,but its clean difference vsP1 has aCI spanningzero,and noise remains higher. Target of beating both baselines on clean and noise was not demonstrated.

P4-on clean with/without38:26.67%/26.50%; recall98.02%/97.96%; noise39.98%/39.73%. P4-off clean36.67%/37.61%.

Failed-row reasons {"runtime-timeout":3,"model-region-must-match-exactly-once":138,"legacy-role-preservation":34,"invalid":2,"structural-scope-mismatch":2,"final-turn-must-submit":2,"induction-gate":63,"invalid-final-rule":1,"provider-error":66,"use-time-applicability-coverage":15,"use-time-schema-count":1,"interrupted-local":6}. Detailed reasons/categories,clean-failure combinations,fallbacks,all10 measures,7 paired comparisons,10k resamples,and category/site tables are in report.json/md. Applicability main33 declined,7 no-rule; all126 admitted variant checks declined across166 entries; zero unexpected applications. No model calls.

To resume: first obtain a coordinator decision on the frozen local transport fault/refreeze. Preserve the four failed local calls and all completed jobs. The44 unrun site/policies are listed in report.missing; do not blindly restart the same local endpoint. Codex's nine unrun sites are independent but no further model call was made under the stop rule. Campaign drivers/progress retain exact job directories. Nothing is running.

## V4 dependency stop � 2026-11-21 14:24 UTC

The 09:30 coordinator request was audited before frozen-file edits. The required P1
change is a generating dependency of P3 and every P4 variant, including the completed
Codex sample. `loop.cjs` loads `baselines.forPages`; that loads p1-readability.cjs;
`Views.initial` includes its rendered output, and G6 also consumes it.

An offline synthetic fixture demonstrates different initial model-evidence hashes:
P3 current 7f8feb1010397d19ce1127dd46671c2c2a7d976a67aeecb6e5d885d2fa04f3f2
versus requested de64c2229c3083a7bc4a4297c7f083c53c9041c49b5217fcc6de461024ddaab4;
P4 current bd7d0ac0b9b5d764d90bff918a276060ed6e3d78e037e23fc30beffb78ace3e7
versus requested 50f2a7d703cf0041d866775842d544961dbe77b5b6a266e992e1904fc856e099.
Evidence: workspace/revision/evaluation/v4/carry-dependency-check.json and its script.
No claim is made that G6's verdict necessarily changes on this fixture.

Stopped under the explicit instruction to report when a carry policy's generating
file changes. Coordinator ruling needed on the P1 induction dependency before v4.
No frozen source edited, no v3 archive move, no v4 freeze or carry, no model request
(including no local request), no regenerated P1, and no new scored result. No review,
commit, push or deployment. V3 still verifies as
9c430042776170100b54484502cc495c3aa82fecdfedda512ffef4ec2b5c16df.
Ledger unchanged: 1908 requests, 1727 paid, USD1.624317132, zero pending/refusals.

## V4 scored P1 and agent evidence split

The scored P1 baseline uses `tests/revision/eval/policies/p1-reader-view.cjs`:
escaped nonempty title in h1, escaped nonempty byline in p, then Readability
content, with no title deduplication. The evaluation P1 runner and development
P1 rescore use that entry point. Agent induction (`baselines.cjs` / `loop.cjs`)
and G6 retain the byte-identical v3 `p1-readability.cjs` wrapper because it is
part of the evidence the agent saw. The offline synthetic probe under
`workspace/revision/evaluation/v4/split-probe.cjs` verifies unchanged initial
P3 evidence SHA-256 `7f8feb1010397d19ce1127dd46671c2c2a7d976a67aeecb6e5d885d2fa04f3f2`
and P4 `bd7d0ac0b9b5d764d90bff918a276060ed6e3d78e037e23fc30beffb78ace3e7`.
The preserved wrapper hash is `cc7307f4094b2c0b1cabf71aadbcd12f24cf3b716e3a6281f11532abd2a67005`.
Saved Windows paths are mapped to the active checkout at read time; historical
pointers, capture bytes and results are not rewritten. Coordinator commands,
coverage and resource estimates are in `workspace/revision/evaluation/v4/RUNBOOK.md`.


## V5 local HTTP length fix and carry

Freeze v5 is v4 (`4c711a25c01d16721d010b50f69d90cefc24d21275489bb66425ea3cd7bcb861`)
plus a local transport correction: `local-http.cjs` supplies Content-Length for
any defined body, using its UTF-8 byte length, unless the caller supplied that
header (case-insensitive). No other existing frozen source changes. New
`eval-v5.cjs` is added to the frozen coordinator sources. Agent tests and this
Markdown file are outside `eval-freeze.sourceFiles()`.

`eval-v5.cjs carry --dry-run` reads the v4 carry index plus all directly generated
v4 jobs. It checks every old frozen hash, 200 loader records against the v4
receipt (including historical Windows path mapping), completed-page coverage,
output/evidence hashes, prior carry-record bindings, and ledger accounting. It
allows the changed local transport only for P4-local, excludes all v4 local rows,
and refuses every other changed generating dependency. Carry writes preserve
HTML, site evidence, accounting and timings; row/receipt provenance is rebound
to v5 and points to the unchanged v4 source records. Every carry record lists
both freezes, every unchanged file hash and the changed local transport hash.

The local-only claim is specific to evaluation policies. The unchanged
`eval-run.runnerFor` selects LocalRunner only for P4-local, CodexRunner for
P4-Codex, and DeepSeekRunner for other model policies. P0/P1/P2-nr use no model
runner. HTTPRunner selects localFetch only for provider pc11 with native fetch;
DeepSeekRunner explicitly sets provider deepseek. The v5 checker verifies the
frozen dispatch/runner hashes, probes dispatch with inert constructors, and
checks the sole frozen local-http import in runners.cjs. Development commands
can also use LocalRunner; they are outside the carried evaluation campaign.

Coordinator order: full offline check; v5 freeze; verify; carry dry-run; carry
write; generate P4-local at concurrency <=4; score --include-local. The v5 global
generation lock serializes campaigns. Finished site receipts (including failures)
are never rerun. Interrupted started sites use the unchanged no-retry harness.
The final report retains the v4 sections, ten measures, frozen thresholds and
10,000 site-clustered resamples; local-inclusive scoring requires all 40 local
sites complete. Exact commands, paths, estimates and worker checks are in
`workspace/revision/evaluation/v5/RUNBOOK.md`. No v5 freeze or real carry was
created by WP-E5a; the coordinator must run all heavy/provider phases on the lab.

## Independent review of the frozen harness (2026-11-22, after the v5 score)

A Codex review (gpt-6.1-sol, high) of eval-run, eval-score, runners, runtime, eval-freeze,
local-http, eval-carry, eval-v4 and eval-v5 found no defect in the monotonic-clock edit or the
Content-Length fix, and seven ways the code could accept bad evidence it never received:
(1) carry trusts each row's own outputSha256 instead of the original receipt; (2) the v3->v4
operational exemption covers all of eval-run.cjs and runners.cjs, not only the edited lines;
(3) discovery does not require freeze-v5-receipt.json fromFreezeSha256 = v4; (4) verify() does
not recheck the test receipt hash; (5) `eval-run.cjs run` does not see carried jobs, so a direct
call could regenerate one; (6) a direct `eval-run.cjs run` bypasses the campaign lock and the
process-local 4-slot limit; (7) a resumed site's wallMs counts only the resumed part.

The code stays as frozen: changing it would void freeze v5 without changing any evidence. Instead,
the read-only audit workspace/revision/audit/review-audit-v5.py checked the real evidence for each
finding and found 0 problems (workspace/revision/audit/review-audit-v5.json): all 450 carried jobs
(3,070 files, 1,350 rows) equal their original generation byte for byte apart from the carry
fields, every originalReceiptSha256 matches the receipt it came from, and all 1,390 scored rows
use the original output hashes (F1); the v3->v4 diff of eval-run.cjs/runners.cjs is deadline,
clock, transport-cause and pc11-only fetch changes, P1 was regenerated under v4, and both files
are identical in v4 and v5 (F2); the v5 receipt names v4 -> v5 and the v3/v4/v5 test receipts
match their records with all commands passing (F3, F4); no request other than P4-local was made
after the v5 freeze and the only v5-generated runs are the 40 P4-local sites (F5); peak
simultaneous local requests 4, every request has a result (F6); no site receipt is interrupted
and no row latency exceeds its site wall time across 490 receipts (F7). Any later freeze should
fix (1)-(7) before generating new rows.

## V6 output-only evaluation

V6 uses freeze schema 2 and `check: 'output'`. Induction still checks schema,
declared region counts, runtime errors and visible output text after reveal.
G2 through G6 are advisory. At delivery, including for P3, anchor counts must
also match. H1 retention, output length and substantive coverage are advisory.

1. Settle the development iteration using `context.check = 'output'`. Keep its
   `final.json` pointer, `iteration.json` and `prompt.txt` with the
   `P4-on-complete-<timestamp>.json` receipt in the iteration's output folder.
   A completed subset such as `--sites=dev-02` is sufficient. The receipt
   records the mode, prompt and gate hashes, and the completed site IDs.
2. Archive both v5 freeze files in `workspace/revision/freeze/archive/v5/`
   before creating v6. Record their old and new paths and SHA-256 hashes.
   Retain the v5 source bytes for verifying its historical freeze.
3. Run `node backend/agent/eval-run.cjs check` through the lab dispatcher.
   Use the resulting receipt with
   `node backend/agent/eval-run.cjs freeze CHECK_RECEIPT SETTLED_POINTER`
   (for example, `workspace/revision/dev-runs/m10/final.json` as the pointer).
   Then run `node backend/agent/eval-run.cjs verify`. The receipt binds the
   successful command arguments and the test and source hashes before and after
   the checks. Creation and verification compare ordered site and page records
   to the archived v5 manifest and hash each capture and reference. A continuity
   mismatch leaves the new manifest for inspection. Archive it before retrying.
4. Generate fresh P0, P1, P4-on and any other approved v6 policies using
   `node backend/agent/eval-run.cjs run POLICY SITE_IDS`. V6 refuses carry and
   `--source` inputs, including the source-dependent P2-nr replay policies.
   Each run holds `workspace/revision/evaluation/v6/generation.lock` across all
   its sites. If a crash leaves the lock behind, verify that the recorded
   process has exited and archive the lock before resuming. Use
   `--resume=DIR` for a v6 run directory. A started, interrupted site is
   completed without retrying generation. Its receipt marks `resumed: true`
   and `wallMs` covers only the time spent completing the interrupted run.
