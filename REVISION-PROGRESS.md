# Visual Adapter revision (AIIPCC69233) progress

## Goal block: methodology and extension revision (started 2026-11-20)

Status: confirmed by the user 2026-11-20 ("the task is quite straight forward... no need to stop
for me to review. you can continue all the way"). Change 2026-11-20 on the user's word: the
"(user checks)" milestones no longer stop the work; progress is shared and work continues. The
reference audit (milestone 4) is still done by the user/Randy, in parallel. Design: docs/revision/DESIGN-2026-11.md.

**Goal:** answer the AIIPCC69233 reviewers with new evidence. The current design makes
agent-generated rules only match the deterministic (rule-based) reader, which defeats the
purpose of using an agent. Redesign how rules are generated and evaluated so the agent's
contribution can be measured fairly, add the privacy safeguards the reviewers asked for, and
rerun on a larger corpus. This project owns methodology and extension; the manuscript is
revised in paper-agent/workspaces/visual-adapter-aiipcc-2026. Submission deadline 2026-11-26.

**Done means:**
- (Added 2026-11-21 on the user's word: "improve the agent's capability of creating a better
  site wise rule. the goal is to surpass the existing rule base methods".) The site-wise agent
  rule (P4) beats the deterministic reader and Mozilla Readability on held-out pages (clean pass
  and noise leakage, site-clustered intervals). Capability is improved iteratively on development
  sites until it surpasses them there, then frozen and evaluated once; the evaluation result is
  reported as measured.
- Rule generation is an evaluated multi-page agent procedure whose output is not forced to
  equal the reader's, scored against references independent of the reader.
- 40 sites x 5 pages corpus, new and held-out pages recorded, with a user/Randy audit of
  about 20% of the drafted references.
- Comparators on the same pages: deterministic reader, Mozilla Readability, fresh rule per
  page (same validation/retry, all attempts counted), shared rule; compiler-repair ablation;
  text-cue ablation; DeepSeek plus a second model (pc11 local model and/or Codex subset).
- Extension sends minimized, de-identified input; discloses what would be sent and asks
  before generating a new rule; offers manual fallback; a failed rule never uploads by itself.
- Site-clustered results, route/failure counts and limitations exported to the paper project.

**Milestones:**
1. Pilot design spec (rule format v3, agent loop, gate, measures, reference format,
   de-identification). Check: summary shown to the user in chat. (user checks)
2. Pilot corpus: 4 sites x 5 pages captured with independent references; reader, Readability
   and the current pipeline scored on the new measures. Check: table in chat showing whether
   the ceiling reproduces. (user checks)
3. Agent loop prototype on the pilot. Check: per-page comparison against reader and
   Readability shown in chat before any widening. (user checks)
4. Full corpus 40 x 5 captured, references drafted, ~20% audit sample chosen. Check: audit
   sample passed by user/Randy. (user checks)
5. Extension changes (v3 rules and gate, minimized de-identified input, consent/disclosure,
   manual fallback). Check: project tests and browser tests pass; Codex review findings resolved.
6. Full rerun with all comparators, ablations and models within the approved cap. Check:
   complete accounting, every attempt counted, site-clustered intervals.
7. Sanitized export to the paper project plus result summary. Check: summary in chat or a
   Google Doc. (user checks)
Added 2026-11-22 with the user's "A" (after: "We need to consider that is a bug in our system and
need to fix them first"):
8. Fix the two bugs: DeepSeek thinking output cap (4,096 tokens all spent on reasoning, logged as
   provider-error) and the gate (G3/G4/G6) refusing removal of recommended/related/promo blocks
   whose text differs per page. Check: tests pass; on the development sites, re-gating the
   stored candidates shows clutter removals now pass while removals of article content are still
   refused, and the re-run with thinking on has no output-limit failures; development sites
   re-scored (DeepSeek within the existing cap).
9. Find why the agent misses the remaining clutter on the other failing pages, and fix the
   cause. Check: before/after table on development sites. (user checks)
10. (Proposed, not yet agreed) Rerun P4 on the 40 evaluation sites with the fixes, scored on
   the new measures. Needs the user's OK for DeepSeek requests beyond the 2,000 cap.
Done-means bullet 1 replacement drafted (workspace/revision/analysis/2026-11-22-goal-change/
new.txt, rule-only, higher/lower better), not adopted: open whether sites with no rule are left
out or count as failures (user called them a bug to fix first).

**Current step (2026-11-22 ~18:30 UTC):** milestone 8, measured on dev, eval re-gate running.
- Code: WP-F1 patch + my fixes (see 17:15 note below), UNCOMMITTED; dev allowance raised 780 -> 900
  (ledger.cjs, ledger.test.cjs, DESIGN 9: milestone 8-9 re-runs; at most 1,935 paid in total).
- Full agent suite via ld 305374: 108 tests, 96 pass, 12 fail, all `settled-file-hash-mismatch:
  extension/procedure-v3.js` (the v5 freeze pins the old gate; expected until a v6 freeze).
- Dev re-run (claude-host, analysis/2026-11-22-m8/rerun.cjs; run 7 context and exact prompt
  b838e299; iteration-6 = dev-01..06, iteration-7 = dev-08; outputs results/capability-agent-6-
  1795368380909 and -7-1795369448092): 71 DeepSeek requests, all generated (0 output-limit, 0
  provider-error; Bug A fixed). dev-07 (w3.org) void twice (heap out of memory mid-site);
  dev-09..12 not run: their pages need >1 GB heap (keychron 3.4+2.5 MB HTML = 450 MB parsed) and
  ld has no route for the DeepSeek key. Harness note: policyRun keeps every site's DOMs (memory
  grows per site); one process per site avoids it. Asked the user how to run the 5 large sites.
- Scoreboard (7 sites, 21 pages, AI rule only; table-7sites.txt): P4-on page pass 52.4 before and
  after (P1 23.8, P0 9.5; higher is better), clutter 6.8 -> 6.6% (lower is better). The old gate
  accepts the same admitted rules (oldgate-iter6.jsonl): on dev the clutter fix changes nothing,
  because the refused exclusions there are not clutter-named (Blogger "Originally published",
  BBC Links container, MDN header). P4-off: 3/7 sites with a rule (G4 on those blocks; MDN G2;
  wikipedia family:no-matching-anchors at use time).
- Eval re-gate done (claude-host, one process per site, 1 GB cap; regate-eval.jsonl, map
  eval-trials.json): 80 v5 final rules (40 sites x P4-on/off): 62 admitted stay admitted, 1 refused
  now passes (P4-off eval-18, #content-recommended-products), 11 still refused (G2, recirc, ...),
  6 no saved rule. Intermediate refusals are not stored, so the full effect needs a fresh eval run
  (milestone 10). ld route failed first (regate skips symlinked folders; fixed by copying).
- User chose B (shared keys on dilab-5080) and needs dilab-5090 for other work: never use or
  reserve it (pin --only dilab-5080). My orphaned job 305372 (ld run killed by timeout mid-upload)
  held 5090 ~1 h; lessons staged in MEMORY.md. Copying ~/.env.shared to 5080 was blocked by the
  permission classifier; the user's B meant a dispatcher key route, so instead: issue
  https://github.com/ffp03/load-dispatcher/issues/69 (job secret route). Do NOT copy secrets.
  When #69 gives a route, adapt m8-lab.sh (now mounts ~/.env.shared) to it.
  2026-11-22 later: user asked to use their laptop meanwhile. thinkpad-2024 is on the tailnet but
  SSH port 22 is closed, so claude-host cannot drive it; asked the user how (laptop session vs SSH).
  User chose A: a Codex session on the laptop runs them. Package (code + context-m8 + iteration-8 +
  ledger, no secrets, sha256 830c0190...) on branch m8-laptop-transfer; laptop-run.cjs (install|check|
  run|pack) in analysis/2026-11-22-m8; results come back on branch m8-laptop-results as
  transfer/m8-laptop-results.tar.gz (staged changed files + SHA256SUMS). Merge here: ledger prefix
  check then take it, copy results/capability-agent-8-* and iteration-8, re-score 12 sites.
  rerun.cjs now maps both C:\ and /home/randy paths (pre-change copy in workspace/archive/2026-11-22-m8-laptop).
  Ready: iteration-8 (output results/capability-agent-8-1795375429159), wrapper
  workspace/revision/ld/m8-lab.sh (mounts ~/.env.shared read-only, one process per site, heap
  6 GB, dev-07 dev-09..12, P4-on then P4-off). Submit: ld submit --only dilab-5080 --reason ...
  --mem 8G --outputs workspace/revision/ld-out-m8lab -- bash workspace/revision/ld/m8-lab.sh;
  then merge the ledger copy (prefix check, append) and payloads, re-score 12 sites.

## Why the AI rule fails (2026-11-22 ~17:00 UTC; user: no-rule sites are a bug, fix first)

P4-on, 92 pages with a rule, 46 fail: 42 on clutter > 5% (median 13%); content/title/order rare.
Leaked clutter text: recommended 52%, widgets 23%, promo 9%. 9 sites fail on all 3 pages.
- Bug A (ours): DeepSeek thinking used the whole 4,096 output-token cap (reasoning_tokens 4096,
  no answer), logged as provider-error "Error": 6 P4-on sites, 7 P4-cue0, 7 P4-full, 1 P4 dev.
- Bug B (ours): gate G4/G6 refused the agent's removal of real clutter (recirc, related-articles,
  recommended-products, site-footer, global-navigation, shipping-promo...) because such blocks
  differ per page and the reader P0 keeps them: refusals on 10 P4-on / 14 P4-off sites; explains
  8/42 (P4-on) and 13/40 (P4-off) clutter-failing pages and several no-rule sites.
- Open C: on the other ~34 clutter-failing pages the agent never tried to remove the block (why
  unknown; check what it is shown). No-rule P4-off: G2 h1-missing 4 sites, G1 generic anchor 2.
Proposed milestones to the user (waiting for yes). Rerun needs DeepSeek OK (cap 2,000 requests,
1,727 used). Scripts: analysis/2026-11-22-failure-analysis/why.py.

## Measures change (2026-11-22 ~15:50 UTC, waiting for the user's yes on exact text)

User: "I want to use what makes sense instead what we decided before" (on the measures). Correction
told to the user: clean pass allows up to 20% of clutter pieces plus order tau >= 0.9 (not zero
pieces, as said earlier). Recomputed on v5 outputs (newm.py in analysis/2026-11-22-failure-analysis):
pass@5% clutter (content chars >= 95%, title, order): P0 23.3, P1 27.5, P4-on 43.3, P4-off 43.3,
P4-local 34.2; P4-on minus P1 +15.8 [+3.3, +28.3], minus P0 +20.0 [+9.2, +32.5]; clutter share
P4-on minus P1 +1.9 [-1.7, +5.3] (not shown no-worse at 2 points); recall chars +15.9 [+10.0, +23.0].
Draft done-means: workspace/revision/analysis/2026-11-22-goal-change/new.txt (copied below when adopted); Codex reading running
(codex-remote, medium) done: reading-1.txt in analysis/2026-11-22-goal-change. Acted: superiority kept
on both page pass and clutter share (no 2-point margin); full pipeline incl. fallback; thresholds
95%/tau 0.9 from the frozen scorer, 5% new (sensitivity 2/10/20%); deciding data = user's choice
(fresh sites vs existing 40, asked). Redraft shown to the user; re-read after their answer, then adopt.
  16:30 UTC user: measures are correct, not to be discussed as post hoc; say higher/lower is
  better; compare the AI rule without fallback. Redraft 2 (new.txt) read by Codex (reading2.txt):
  high = pages with no rule dropped vs counted as fail -> asked the user (A leave out + report
  count / B count as fail). Rule-only numbers (rule.py): P4-on rule on 92/120 pages, 31/40 sites;
  same pages pass 50.0 vs P1 31.5 (+18.5 [+3.3, +33.3]), clutter 8.7 vs 7.6 (+1.1 [-1.4, +3.7]),
  recall 99.5 vs 86.2. Counting no-rule as fail: 38.3 vs 27.5 (+10.8 [-1.7, +23.3]).

## Failure analysis and next-phase proposal (2026-11-22 ~16:00 UTC, waiting for the user)

Read-only, from the v5 score (scripts: workspace/revision/analysis/2026-11-22-failure-analysis/).
- P4's noise is mostly small in-content widgets (Reply, Copy, Fork, "Was this helpful?"): 433 of
  1,152 noise units; P4 leaks 78-79% of them, P1 5%. Upper bound if widgets were removed with no
  content loss: P4-off clean 36.7 -> 55.0% (also author/share/promo/recommended: 67.5%); P1 27.5%.
- P1 misses content on 77/120 pages (items 81%, lede 78%, price/specs ~60%, description 33%,
  heading 23%); P4-off misses almost nothing (recall 99.8%).
- Fallbacks to the noisy reader P0: P4-on 28 pages (18 DeepSeek provider errors, 6 sites), P4-off
  34 pages (gate rejects on p1: H1 missing 4 sites, generic anchor 2, G6 baseline regression 3...).
- Whole-page switching P1/P4 by output length does not win (clean <= 33%); best-of oracle 51%.
- By page type: P4-off wins documentation 18/26; P1 wins discussion 9/18 vs 4; products 0-3/21 all.
- Diagnosis: P1 and the reader are only inputs (hints) to the agent; the output is one static CSS
  rule; Readability's cleaning is never applied to it; fallback is P0, not P1.
Proposed (asked the user): 1. approach A rule region + Readability-style widget clean-up +
Readability fallback (offline trial on dev sites first, no model calls) / B Readability first +
LLM site rule that adds back / removes / C both. 2. eval sites are no longer blind: A develop on
dev, score on eval as a declared post-hoc second evaluation / B also capture fresh held-out sites.
New milestones pending the user's yes (goal change -> change-review section A before adoption).
Skill lessons 1/4/5 (MEMORY.md): user left the review to the director; run as one batch later,
not blocking.

## START HERE (2026-11-22, 14:20 UTC, claude-host)

1. **Done this block:** Codex review (dilab-5080, gpt-6.1-sol high) of the frozen harness: 7
   findings (carry trusts row hashes; broad v3->v4 operational exemption; v5 receipt and test
   receipt not rechecked; direct `eval-run run` misses carried jobs and bypasses lock/4-slot cap;
   resumed wallMs). Code left frozen; read-only audit workspace/revision/audit/review-audit-v5.py
   -> review-audit-v5.json: 0 problems (450 carried jobs, 1,390 scored rows, 490 receipts, peak 4
   local). Written up in backend/agent/EVALUATION.md. Any later freeze must fix (1)-(7) first.
2. **Committed** c48c870 (128 files, LF; the 3 CRLF frozen files ledger.cjs, procedure-core.js,
   deepseek-runner.cjs kept byte-exact with -text in .gitattributes; all 67 committed frozen files
   match freeze v5). ~230 CRLF-only noise files still unstaged on purpose; backend/__pycache__ untracked.
3. **Export:** paper-agent/workspaces/visual-adapter-aiipcc-2026/inputs/results/2026-11-22-revision-evaluation/
   (README with tables and limitations, report.md, report.json, per-page.csv, hashes.json), script
   workspace/revision/export/export-v5.py. **Results Doc** (private, workplace route, text verified):
   https://docs.google.com/document/d/1X4c4W5oWh5jQDaIJYOE9qi4qYwgJAtWcIoOgJ2oo5ww/edit
   (built by workspace/revision/export/publish-doc.py from results-doc-v5.json; publish-report.py
   in backend/agent points at the old helper name algoma_reports.py, left unchanged).
4. **Housekeeping done:** 6 service-use records (codex x3, local-llm x2, google-workplace);
   subagent report appended (WP-E4d/e, WP-E5a, review; 10.9M tokens, ~95% cached). Token review
   not written: per-task share of the weekly quota is not measurable from the host readings.
5. **Waiting for the user:** milestone 7 check (Doc; goal/achieved/failed summary given in chat
   ~15:30 UTC). Memory triage answered: 1 yes, 3 dropped, 4 yes, 5 yes generalized (long jobs show
   progress while running); 1/4/5 drafted in MEMORY.md and wait for change-review (T2, ~7 Codex
   jobs per skill; asked the user whether to run now). 2: user did not understand; re-explained, waiting. Offered earlier, not asked again: P4-local paired comparison.
6. **Nothing is running.** No watchdogs armed.

## START HERE (2026-11-22, 06:20 EST, claude-host) - superseded by the 14:20 UTC block.

1. **Where the work is:** evaluation complete. Freeze v5
   b555d00affc2781ab7ee492493fa99950f0a31dd6d58972eee81c84908044351 (v4 + local-http.cjs
   Content-Length fix; v4 archived in freeze/archive/v4/). Final report:
   workspace/revision/results/eval-v5-score-1795327652409/report.md (+report.json, rows.jsonl,
   summary.json); non-local policies identical to the v4 score. Clean pass: P0 10.0, P1 26.7,
   P4-on 26.7, P4-off 36.7, P4-local 30.0, Codex 70.0 (10 sites). Ledger 2,146 requests, 1,727
   paid, $1.624317132, pending 0. Details: item 5 of the 14:35 block (03:05-06:15 entries).
2. **Results already shown to the user** (table in chat 06:20). Offered: an extra, labelled
   P4-local minus P4-on paired comparison (not in the frozen pair list); no answer yet, do not
   add it unasked.
3. **Next, in order:** (a) Codex review (codex-remote, or sudo codex-job in place since workspace/
   is git-ignored) of the uncommitted code: backend/agent/{eval-run,eval-score,runners,runtime,
   eval-freeze,local-http,eval-carry,eval-v4,eval-v5}.cjs and their tests; risks: carried rows
   cannot change, freeze/carry bindings, the monotonic-clock edit, Content-Length fix; give the
   diff/brief/design, ranked findings only. (b) Commit by explicit path with LF (231 tracked files
   are CRLF-only noise: do not commit them), pull --rebase, push. Note backend/agent/ and
   tests/revision/ show as untracked: check .gitignore/what was committed before. (c) Sanitized
   export to paper-agent/workspaces/visual-adapter-aiipcc-2026. (d) Results Google Doc.
   (e) Housekeeping: service-use records (DeepSeek, Codex, local-llm), subagent-use Algoma report
   (WP-E4d/e, WP-E5a: gpt-6.1-sol high), token review if >10% weekly Codex, memory triage.
4. **Route facts:** only dilab-5090 ld jobs reach the local model (load-dispatcher#66, resolved by
   the issues conversation; nothing more needed). ld uploads take 10-25 min (project ~2.5 GB after
   .ldignore). Scripts in workspace/revision/ld/ (in-place.sh, local-v5.sh, score-v5.sh,
   check-docker.sh). The void v4 local run (all 411) is kept unmerged in ld-out-local/stage.
5. **Running (13:26 UTC):** Codex review on dilab-5080 (gpt-6.1-sol high; brief in the session
   scratchpad, output there as review-out.txt; if lost, `codex-remote result` without --host).
   Prepared meanwhile: commit set = 9 real tracked changes (MEMORY, REVISION-PROGRESS,
   backend/local-ai.cjs, docs/LOCAL_AI.md, docs/revision/DESIGN-2026-11.md, extension/{background.js,
   options.html, options.js, sidepanel.css, sidepanel.html, sidepanel.js}) + untracked .ldignore,
   backend/agent/, backend/{layout-fake-runner,runtime-disclosure,runtime-layouts}.cjs,
   docs/revision/corpus-manifest.json, extension/{archive/,procedure-v3.js,reader-frame.js},
   tests/revision/ (not backend/__pycache__). Working copies are CRLF and frozen by hash: stage LF
   blobs via hash-object/update-index, do not rewrite working files. Export script:
   workspace/revision/export/export-v5.py SCORE_DIR OUT_DIR COMMIT (target
   paper .../inputs/results/2026-11-22-revision-evaluation/, plus a README with limitations).

## START HERE (2026-11-21, 14:35 EST, claude-host) - superseded by the 2026-11-22 06:20 block.

1. **Where the work is:** conversation moved to claude-host. Freeze v4 unit not resumed yet. Checked
   here: 501 of 505 v3 frozen files match their hashes; 4 differ (WP-E4b edits): backend/agent/
   eval-run.cjs, eval-score.cjs, runners.cjs, runtime.cjs. Also touched after v3: new
   backend/agent/local-http.cjs, EVALUATION.md, tests/revision/agent/{evaluation,runtime,reader-view}.test.cjs,
   new tests/revision/eval/policies/p1-reader-view.cjs. Half-written step: freeze/archive/v3/
   (copies, 14:27 UTC) exists while the active freeze is still v3. Ledger 5,697 lines, last event
   13:49 UTC; WP-E4c never ran (laptop network). Local model service up, same model as frozen.
2. **Route constraints found:** briefs/ and runs/ are git-ignored, so a codex-remote job does not
   see them (inline the briefs). P4-Codex needs the `codex` CLI with ChatGPT login and Node on one
   machine: claude-host has the login but no Node; ld workers have Node but no login. 231 tracked
   files show as modified only because of CRLF from the Windows copy; 11 have real changes (commit
   by path, keep LF).
3. **Plan proposed to the user (14:35):** (1) codex-remote job: finish code fixes 1a-1e and the P1
   split, offline probe, carry tooling, targeted tests; (2) ld: npm ci + full suites; (3) ld: freeze
   v4 + carry + P1 regen + dev P1 re-score; (4) Codex on 9 sites; (5) final score via ld; (6) local
   model 40 sites; then verify, review, commit, export, Doc, housekeeping.
4. **What is open:** user chose 1A/2A ("go with your plan", 14:38): Codex comparator on claude-host
   with project-local Node; local model through ld. Audit unchanged.
5. **What is still running (17:35 EST):** P4-Codex 9 sites done on claude-host (27/27 ok, ~10 min,
   455 MB; log runs/v4-codex.jsonl). P1 regenerated 40 sites + dev re-score via ld 305297 (89 s /
   1.0 GB, 56 s / 1.5 GB), merged from ld-out-p1-merged/stage (no overwrite, no ledger change);
   dev result results/dev-P1-v4-1795299482483/summary.json: P4-on minus Reader View P1 clean +27.8,
   recall +15.6; P1 titleFirst 13.9%. **Blocker:** ld jobs cannot reach claude-host:8780 from
   dilab-5090 or dilab-pc12 (connect timeout; DNS fine) -> load-dispatcher#66; local run not
   started (zero local requests). Asked the user how to run it. Running: ld 305301 v4 score
   (local pending; ld/score.sh, stage ld-out-score).
   v4 score (local pending) done via ld 305301 (124 s, 3.9 GB peak):
   results/eval-v4-score-1795300320565/report.md. Clean pass: P0 10.0, P1 26.7, P3 17.5, P4-on 26.7,
   P4-off 36.7, Codex 70.0 (10 sites); P4-on minus P1 clean 0.0 [-15.8, 15.8], noise +31.9 (worse),
   recall +18.9; P4-off minus P4-on clean +10.0 [-0.8, 21.7]; Codex minus P4-on clean +33.3 [10, 63].
   Waiting on the user: where to run the local model (A claude-host / B wait for #66 / C not run).
   **2026-11-22 02:50 EST:** user: "LD works now" (ld jobs may reach claude-host:8780). Submitted
   ld va-v4-local (in-place.sh + ld/local.sh, DOCKER_NET=host, STAGE=workspace/revision/ld-out-local,
   --mem 4G, --sync-every 600). First try landed on dilab-pc12 and failed fast (exit 4, model
   unreachable, zero requests). #66 resolved by the issues conversation: only dilab-5090 jobs reach
   claude-host:8780 (5080 contained, lab PCs denied) -> resubmitted with --only dilab-5090.
   Next: check first sites' content, merge ld-out-local/stage (no overwrite), score --include-local
   via ld (STAGE=ld-out-score2), Codex review, commit, export, Doc. (#66 needs no more from us.)
   **03:05 EST: v4 P4-local run is void, NOT merged.** ld 305326 on dilab-5090 ran 40 sites in 63 s
   (2.5 GB peak): all 40 requests provider-error `provider-http-411`, all 120 outputs fallback.
   Cause: frozen v4 backend/agent/local-http.cjs (node:http, new in v4) writes the body chunked
   with no Content-Length; the model portal (/home/randy/Dev/image-portal portal/server.py:113)
   deliberately refuses chunked bodies (curl check: chunked 411, Content-Length 400). v3 used
   global fetch (sets Content-Length). Evidence kept unmerged in workspace/revision/ld-out-local/
   stage (results eval-P4-local-2026-11-22T02-56-*, its ledger copy with 40 request/result pairs).
   Real ledger and results unchanged (zero v4 local requests recorded). Fix needs a frozen file
   change -> asked the user: A freeze v5 (Content-Length fix + test, full checks via ld, carry all
   v4 rows, run P4-local under v5) / B ask image-portal to accept chunked / C report local not run.
   **03:20 EST: user chose A (freeze v5).** Running Codex WP-E5a in place (sudo codex-job, gpt-6.1-sol
   high, brief workspace/revision/briefs/WP-E5a-freeze-v5.md, output runs/WP-E5a.result.md): the
   Content-Length fix + 411 test, v4->v5 freeze/carry/generate/score tooling, carry dry-run, v5
   RUNBOOK. Then (coordinator): full checks via ld (check-docker.sh) -> freeze v5 -> verify -> carry
   dry-run/write -> P4-local 40 sites on ld --only dilab-5090 -> score --include-local via ld ->
   Codex review of all uncommitted code -> commit/push -> export -> Doc.
   **04:55 EST:** WP-E5a done (30 min; result runs/WP-E5a.result.md): local-http.cjs one-line
   Content-Length fix (sha e426f178...136d), new backend/agent/eval-v5.cjs + tests; I re-ran
   runners 11/11, eval-v5 6/6, eval-carry 5/5. Full checks via ld 305327 (Docker+Chrome, pc12):
   144/144 + 14/14, receipt workspace/revision/evaluation/checks-1795322159358/receipt.json.
   **Freeze v5 b555d00affc2781ab7ee492493fa99950f0a31dd6d58972eee81c84908044351** created (292 s,
   claude-host, v4 archived to freeze/archive/v4/) and verified. Carry written (5 s):
   results/eval-v5-carry-b555d00affc2, 450 jobs / 1,350 rows / 0 requests, index
   evaluation/v5/carry-index.json. Submitted ld va-v5-local (--only dilab-5090, ld/local-v5.sh,
   STAGE=workspace/revision/ld-out-local5); .ldignore now also skips workspace/revision/ld-out*/.
   Next: check early outputs are ok:true, merge stage (no overwrite; ledger = job copy appended),
   score --include-local via ld, review, commit, export, Doc.
   **05:55 EST: P4-local under v5 done** (ld 305334 on dilab-5090, 1,875 s incl. ~24 min model
   start, 2.2 GB peak): 40/40 sites, 199 requests all 200/generated, 0 pending; trials 24 accepted,
   12 gate-rejected, 4 invalid; outputs 64 ok / 56 fallback. Merged ld-out-local5/stage (1,396 new
   files, cp -n; ledger replaced by the staged copy after checking it is the real ledger + 597
   appended lines; old ledger archived workspace/archive/ledger.jsonl.pre-v5-local-2026-11-22, sha
   28604f8c...; new 0f353225...). Ledger: 2,146 requests, 1,727 paid, $1.624317132, pending 0.
   **06:15 EST: final v5 score done** (ld 305338, 130 s, 3.8 GB peak; merged 4 new files):
   results/eval-v5-score-1795327652409/{report.md,report.json,rows.jsonl,summary.json}. Every
   non-local policy field is identical to the v4 score (checked: 0 differences). P4-local clean
   30.0, recall 0.984, noise 0.493, complete 95.8, noFallback 22.5, 56 fallbacks (gate G3/G4/G6),
   199 requests. The frozen pair list has no P4-local pair (none was planned). MILESTONE DONE:
   local model on 40 sites + final score. Next: Codex review of all uncommitted code, commit
   (LF, explicit paths), pull --rebase, push, sanitized export, results Doc, housekeeping.
   Earlier (17:05 EST): full checks passed in Docker+Chrome (142/142 + 14/14;
   receipt workspace/revision/evaluation/checks-1795297263206/receipt.json). **Freeze v4
   4c711a25c01d16721d010b50f69d90cefc24d21275489bb66425ea3cd7bcb861** created and verified (130 s,
   250 MB, on claude-host). Carry written: results/eval-v4-carry-4c711a25c01d, index
   evaluation/v4/carry-index.json (401 jobs, 1,203 rows, 0 requests). Carry records hold absolute
   /home/randy/Dev/Visual_adapter paths, so ld steps run in Docker with the project mounted at that
   path (workspace/revision/ld/in-place.sh stages changed files to ld-out/stage for merging).
   Running: ld va-v4-p1 (P1 regen 40 sites + dev-score; ld/p1-dev.sh) and P4-Codex 9 sites on
   claude-host (scope va-v4-codex, MemoryMax 3G, log runs/v4-codex.jsonl; P1 writes no ledger
   entries, so the two do not conflict). Next: merge stage, score via ld, local 40 via ld.
   Earlier (16:35 EST): ld check job 1 (305287, dilab-pc7): 141/142 agent/eval
   tests passed; capture suite timed out (needs Google Chrome; no worker or claude-host has it).
   Failed test: score coverage, `invalid-latencyMs` (negative wall-clock duration under WSL load).
   Fixed by me: eval-run.cjs durations use performance.now() (6 spots; original archived as
   workspace/archive/eval-run.cjs.pre-monotonic-2026-11-21); evaluation.test.cjs 15/15 locally.
   Now: ld job va-v4-check2 = check inside Docker node:24-bookworm with Chrome installed by
   playwright-core (workspace/revision/ld/check-docker.sh); first receipt kept in ld-out-check1/.
   Earlier (15:30 EST): WP-E4e done (runs/WP-E4e.result.md): fixes 1a-1e + split
   complete, 47 targeted tests pass, probe keeps P3/P4 evidence hashes (split-probe-1795290562305.json),
   carry dry-run clean (1,203 rows, 401 jobs, 500 unchanged hashes, 200 loader records; changed
   files allowlisted as operational: eval-run, eval-score, runners, runtime, eval-freeze path map).
   New: backend/agent/eval-carry.cjs, eval-v4.cjs; command sequence in
   workspace/revision/evaluation/v4/RUNBOOK.md. Now: `eval-run.cjs check` through ld
   (workspace/revision/ld/check.sh, outputs ld-out/; .ldignore added at the root). Note: dilab-5080 is
   contained (no tailnet), so the local-model job must go to a worker that reaches claude-host:8780.
   Earlier entry (14:47 EST): WP-E4e (resend of WP-E4d, which stopped at once on
   read-only ACL masks from the copy; masks restored with setfacl m::rwX outside .git; output
   runs/WP-E4e.result.md, log /var/log/codex-jobs/20261121T194700Z-claude-host-929cc5a8.jsonl).
   Attempt-1 finding: saved run-7 pointers hold Windows absolute paths (resolve at read time).
   Original entry: WP-E4d Codex job in place on claude-host (`sudo codex-job`,
   gpt-6.1-sol high, 7200 s cap; brief briefs/WP-E4d-claude-host.md; output runs/WP-E4d.result.md;
   host log /var/log/codex-jobs/20261121T193912Z-claude-host-478a9e54.jsonl). Scope: finish fixes +
   split, probe, carry tooling with dry-run, targeted tests; no requests, no freeze. Route change:
   in place on claude-host because the job needs the git-ignored workspace. Setup done: Node 24.22.3
   at workspace/tools/node (checksum verified); Windows node_modules archived to
   workspace/archive/2026-11-21-windows-node-modules/; npm ci at root and backend (frozen
   package-lock.json hash unchanged). Next: inspect result, ld full suites + `eval-run.cjs check`,
   then freeze v4/carry, P1 regen, dev re-score (ld), Codex 9 sites (claude-host), score, local (ld).

## START HERE (2026-11-21, 12:55 EST) - superseded by the 14:35 block (moved to claude-host).

1. **Where the work is:** freeze v4 unit (WP-E4) half-done and stopped. Its worker (Codex thread
   01a1fd7e-9e04-74f1-af9b-b1bc7eda9bd9, local CLI) had edited backend/agent/runners.cjs,
   backend/agent/runtime.cjs, tests/revision/agent/reader-view.test.cjs and added
   tests/revision/eval/policies/p1-reader-view.cjs; no freeze v4 yet, no carry records, no
   regeneration. Freeze v3 9c430042... still verifies. Ledger 1,908 requests, 1,727 paid,
   ~$1.62, zero pending. The user is moving this conversation to the VM (claude-host) through
   another agent (2026-11-21 12:55); the laptop's network could not reach chatgpt.com.
2. **What is settled:**
   - v3 partial report is the current result:
     workspace/revision/results/eval-v3-partial-score-1795269394298/report.md (and runs/WP-E3.result.md).
     P4-on ties P1 on clean pass (26.67% each); P4-off 36.67% (+10.0 [-6.7, 26.7] vs P1);
     agent rules far more complete (+52.5) and higher recall (+18.9), more noise (+31.9).
     Target (beat readers on clean and noise) not demonstrated; reported as measured. The main
     configuration stays P4-on (frozen before evaluation); P4-off is reported as a variant.
   - P1 split ruling (briefs/WP-E4b-p1-split.md): agent evidence and G6 keep the v3 Readability
     wrapper byte-identical; only the scored P1 baseline uses the Reader View rendering.
   - v4 fixes: briefs/WP-E4-freeze-v4.md (1a-1e). No P3/P4 regeneration (would exceed the cap).
   - Local model: the user's "continue" (12:39) is read as yes to rerunning it on 40 sites under
     v4 (option A); stated to the user, not contradicted yet.
3. **What is open:** audit (milestone 4, user/Randy, does not block). Confirm with the user only
   if they say "continue" meant otherwise.
4. **What the next unit meets:** resume the Codex thread with briefs/WP-E4c-resume.md (re-check
   edited files, then finish WP-E4b: fixes, freeze v4, P1 regeneration, Codex on 9 sites, final
   score; no local requests). Then a local-model run on 40 sites under v4 (at most 4 at once;
   the user's local-LLM rules). Then: verify, independent Codex review of the uncommitted code,
   commit by explicit path, pull --rebase, push, sanitized export to the paper project, results
   Doc, housekeeping (service-use DeepSeek record, Algoma subagent report, token review, memory
   triage). All code changes since 09b1cdd are uncommitted; data lives in git-ignored workspace/.
   Keep the machine awake during runs (the laptop sleep cost 3 h; a slept run loses in-flight
   requests). Watchdogs (runs/watchdog.ps1) are Windows-only and pause during sleep.
5. **What is still running:** nothing. All workers, waiters and watchdogs stopped at 12:50.

## START HERE (2026-11-21, 09:20 EST) - superseded by the 12:55 block; items 3 and 5 are out of date.

1. **Where the work is:** WP-E3 full evaluation (freeze v3 9c430042...) finished all DeepSeek
   policies on 40 sites and stopped on the local transport fault (local calls cut at ~321 s, Node
   HTTP client 300 s default; 35 local and 9 Codex sites unrun). Partial report:
   workspace/revision/results/eval-v3-partial-score-1795269394298/report.md. Main result: P4-on
   ties P1 on clean pass (26.67% each), recall +18.9, complete +52.5, noise leakage +31.9 (worse);
   P4-off clean 36.67% (+10.0 [-6.7, 26.7] vs P1). Target (beat readers on clean and noise) not
   demonstrated. Ledger 1,727 paid, ~$1.62, zero pending.
2. **What is settled:** freeze v4 for the four review-3 fixes plus the local transport fix
   (briefs/WP-E4-freeze-v4.md); P1 regenerated, Codex on 9 sites, final score; no local requests.
3. **What is open:** user decision (asked 09:15): A. rerun the local model on 40 sites under v4
   (~3-4 h) or B. report it as not run. Blocks only the local run. Audit (milestone 4) unchanged.
4. **What the next unit meets:** WP-E4 result with freeze v4 hash and final report; then local run
   if A, verify, Codex review of uncommitted code, commit by path, push, sanitized export, results
   Doc, housekeeping (service-use DeepSeek record, Algoma report, token review, memory triage).
5. **What is still running:** nothing (12:50). The laptop slept 09:30-12:38; WP-E4b had edited
   runners.cjs, runtime.cjs, reader-view.test.cjs and added p1-reader-view.cjs, no freeze yet, zero
   pending requests. After waking, this network cannot reach chatgpt.com (DNS fine, connections
   time out; google and api.openai.com fine), so WP-E4b and a resume (WP-E4c) were stopped. To
   resume: on a network that reaches chatgpt.com, `codex exec resume 01a1fd7e...` with
   briefs/WP-E4c-resume.md (re-check edited files, then finish WP-E4b). Older entry: WP-E4b (resumed thread 01a1fd7e..., runs/WP-E4b.jsonl, result
   runs/WP-E4b.result.md, watchdog 175 min from 09:26 EST; waiter in the conversation). WP-E4
   stopped at 09:24 (runs/WP-E4-stop1.result.md): P1 output feeds P3/P4 evidence and G6, so a P1
   change would break carry. Ruling (briefs/WP-E4b-p1-split.md): agent evidence keeps the v3
   wrapper byte-identical; the scored P1 baseline uses a new Reader View rendering file.

## START HERE (2026-11-21, 04:45 EST) - superseded by the 09:20 block; its running items are out of date.

1. **Where the work is:** tuning closed. Iteration 5 (WP-C9: gate link-density fix + widget hints)
   regressed (12/36 clean vs run 7's 17) and was reverted under the 6a rule (DESIGN 7b Outcome;
   archive workspace/revision/archive/iteration5-reverted-2026-11-21/). Frozen configuration =
   run 7 (prompt b838e299..., procedure-v3 316e7ba0..., outline ef9da79c..., P4 thinking on).
   Dev scoreboard to report: P4-on 17/36 clean, recall 99.9%, noise leakage 25.1%, char share
   6.8%; P1 1/36, 79.2%, 19.9%, 9.6%; P0 0/36, 97.2%, 68.5%, 15.5%.
2. **What is settled (coordinator):** DESIGN 7b + Outcome, 9a budget, dev allowance 780 (692 used);
   createDOM strips <style> (tests/revision/eval/dom.cjs; neutral on 60 dev pages; fixes eval-23
   hang; old file archived in workspace/revision/archive/dom-style-strip-2026-11-21/).
3. **What is open:** milestone 4 audit (user/Randy; does not block the run): private Doc
   https://docs.google.com/document/d/1X7raCoPq4MWFVbFUdRGlHKJlcieyMDWEfe4RP9bnm7E/edit , folder
   https://drive.google.com/drive/folders/1VwOAfaPS7Rcu2LEKgbkxtOjdXKJIK5sQ ; 40 pages, one held-out
   page per site, seed in workspace/revision/audit/audit-sample.json (draw-sample.cjs,
   build-audit-doc.cjs, publish-audit.py, audit-publish-receipt.json). Corrections from the audit
   are applied blind to policy outputs and the scoreboard re-scored; generation is not rerun.
   Eval lint: 200/200 pass, dev 60/60 (2026-11-21 ~04:50).
4. **What the next unit meets:** freeze v2 370a379b... (WP-E2, 05:40): P1 renders Readability's
   title+byline (Firefox Reader View); accounting from site receipts. Dev re-score with fixed P1:
   P1 7/36 clean, recall 84.3%, noise 19.9%, chars 9.3%; P4-on minus P1: clean +27.8 [-2.8, 61.1],
   complete +52.8 [27.8, 77.8], recall +15.6 [6.7, 26.8], noise +5.2 [-20.1, 25.4], chars -2.5
   [-9.7, 2.9]. eval-02 sample: all 13 policies ran (P4-on 0/3 clean: excluded every `details`;
   P4-off, cue 0, cue full, local, Codex 3/3; P2 = P0; P2-nr 3/3); 31 requests (22 DeepSeek,
   3 local, 6 Codex). Applicability and three sites (eval-08/18/19, 15 pages) blocked by the
   loader's host rule (bare domain vs www.) -> freeze v3 in WP-E3 (one leading www. ignored).
   Measured estimate for 39 sites: 858 paid + 117 local + 54 Codex requests, ~4.5 h sequential.
5. **What is still running:** WP-E3 full evaluation (resumed thread 01a1fd7e..., runs/WP-E3.jsonl,
   result runs/WP-E3.result.md, watchdog 345 min from 05:46 EST). Freeze v3 9c430042... (05:58).
   Final review 3 done (06:05): 4 should-fix findings, workspace/revision/briefs/REVIEW-3-findings.md,
   to be fixed after WP-E3 in freeze v4 (P1 regenerated free, re-score). Then: verify, commit by
   path, push, export, report Doc, housekeeping.

## START HERE (2026-11-21, 04:40 EST) - superseded by the 04:45 block (WP-C9 finished and was reverted).

1. **Where the work is:** tuning run 7 (WP-C8) finished: on the 36 held-out dev pages P4 thinking
   on = 17/36 clean, recall 99.9%, noise leakage 25.1%, noise character share 6.8%; P1 = 1/36,
   79.2%, 19.9%, 9.6%; P0 = 0/36, 97.2%, 68.5%, 15.5%. Clean pass beats both; unit noise
   leakage does not yet beat P1 (CI spans zero). Report Doc (private, owning route):
   https://docs.google.com/document/d/16VJsXgkSYlX-3uxlJpBeCg1-jZAebYmAqn_r3afy4nM/edit
   Iteration 5 (WP-C9) is under way with the gate link-density fix and widget suspicion (7b).
2. **What is settled (coordinator, 2026-11-21):** DESIGN 7b (link density counts an enclosing
   anchor; bug fix, no threshold change); dev allowance 780 (ledger.cjs + test); DESIGN 9a
   evaluation budget (P4 thinking on is the main configuration; P3 on each site's p3 only).
3. **What is open:** jsdom hangs on eval-23's 150 KB stylesheet in createDOM (P0/P1/scorer/lint;
   the agent's loader already strips styles). Planned fix: strip <style> in
   tests/revision/eval/dom.cjs createDOM, after a neutrality check on the 60 dev pages (P0/P1
   output and extracted-text hashes identical) and a scan of all pages for parse time. Then rerun
   eval lint (`node tests/revision/capture/check-reference.cjs --eval --write`): eval-40-p4 still
   needs its re-stamp under the L4 1,000-character threshold (199/200 stamped pass).
4. **What the next unit meets:** after WP-C9: accept or reject iteration 5; freeze (prompt, views,
   gate hashes; evaluation freeze file); evaluation per DESIGN 9a; audit Doc (40 pages, one per
   site); redaction audit; final Codex review; commit by path; export.
5. **What is still running:** WP-C9 local Codex (runs/WP-C9.jsonl, result runs/WP-C9.result.md,
   watchdog runs/WP-C9.watchdog.log, 160 min from ~04:30 EST); neutrality check and parse scan in
   the session scratchpad (temporary).

## START HERE (2026-11-20) - superseded by the 2026-11-21 04:40 block; its running items are out of date.

1. **Where the work is:** diagnosis done, plan agreed in outline; nothing implemented or run.
2. **What is settled (user, 2026-11-20):**
   - Corpus expansion is done here with Codex in the browser, 40 sites x 5 pages (answer 1A).
   - Models: DeepSeek Flash for main runs, cap $5 and 1,000 calls total, plus Codex as a
     second model on a subset (answer 2A); additionally a local model on pc11 (details pending).
   - References: Codex drafts, user/Randy audit ~20% sample chosen by the agent (answer 3A).
   - Codex workers run through the user's local Codex CLI (logged in) so they can drive a
     browser; Claude designs, supervises and reviews.
   - Pilot first; widen only after the user checks milestones 2 and 3.
3. **What is open:**
   - pc11 local model: details received 2026-11-20 (Qwen3.8-27B-abliterated at claude-host:8780, recorded in DESIGN section 4); /v1/models answered.
   - (settled 2026-11-20, user answer A) DeepSeek cap is now $5 and 2,000 requests. WP-C1's guard was built for 1,000: update in WP-C2. User offered to raise the local model context beyond 16k if needed.
   - Goal-block confirmation (user; blocks milestone 1).
4. **What the next unit meets:**
   - Diagnosis: acceptance gate and compiler (extension/procedure-core.js inspect/compile)
     union reader-defined blocks into the model region and dropped 170 model exclusions;
     scoring averages ~1 noise check per page; reader alone 39/44, AI without fallback 33/44
     fresh and 29/44 shared; AI fixed 0 of the 4 reader failures; 5 pages never reached the
     model. Prompt is one-shot DeepSeek Flash, thinking off, 12,000-character sample,
     output main/exclude/name only (backend/deepseek-runner.cjs, backend/model-evidence.cjs).
   - Frozen October study: workspace/task023/refresh-20261021/final-study-v1 (do not modify).
   - Reviewer checklist: C:\Users\final\Downloads\AIIPCC69233 Revision Checklist.docx.
5. **What is still running (updated 2026-11-21 ~02:30):**
   - WP-A4 evaluation references, 3 parallel fresh workers (gpt-6.1-sol high): eval-01..13,
     eval-14..27, eval-28..40; logs runs/WP-A4-<from>.*; watchdogs at 175 min (watchdog-A4-*.log).
   - WP-C6 runtime-boundary fix from review 2 (agent thread in runs/WP-C1.thread), watchdog 48 min.
   - Done/accepted: corpus (WP-A3b: 60 dev pages pass lint L1-L6, 200 eval captures pass L5/L6,
     12 dev sites, 40 eval sites); extension (WP-D4: 12 tests, sandboxed panel, consent per
     induction, clear deletes); scorer (46 tests); agent (66 tests).
   - Reviews: review 1 and 2 (dilab-5080) findings fixed or being fixed; a final review of all code
     is due before the code commit. NOTE: commit 1b30875 accidentally included unreviewed
     extension changes (git commit -a); disclosed to the user; review covers it.
   - Next: after WP-C6, resume WP-C for capability tuning (DESIGN 6a) on the valid 60-page dev
     set, scoreboard vs P0/P1; freeze; then evaluation run (P0-P4, ablations, models) and the
     40-page audit Doc for the user/Randy.
   - Worker time caps: `timeout` does not stop codex.exe on Windows; use runs/watchdog.ps1.
   - Ledger: 146 paid dev requests, $0.04; 41 local-model requests.
