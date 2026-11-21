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

**Current step:** milestone 1 done 2026-11-20 (docs/revision/DESIGN-2026-11.md). Milestones 2-3 under way: workers WP-A1 (capture), WP-B1 (harness), WP-C1 (agent loop) running.

## START HERE (2026-11-20)

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
5. **What is still running (updated 2026-11-21 ~00:40):**
   - WP-A1 eval capture (gpt-6-luna high), ~183/200 pages; runs/WP-A1.*
   - WP-A3 lint L1-L6 + dev re-annotation under guideline v2 (gpt-6.1-sol high, 150 min); runs/WP-A3.*
   - WP-D1 extension consent/family flow/manual fallback (gpt-6.1-sol medium, 170 min); runs/WP-D1.*
   - Done and accepted: WP-B1..B4 (scorer, 46 tests), WP-C1..C4 part 1 (agent, gate, ledger, 55 tests).
     WP-C4 stopped by the coordinator before tuning: dev references were not fit to tune on.
   - Codex review 1 (dilab-5080) findings fixed; a second review of all new code is due before commit.
   - Next: when WP-A3 passes, rerun the dev scoreboard (P0/P1) and resume WP-C (thread in
     runs/WP-C1.thread) for the capability tuning (DESIGN 6a); then evaluation references (WP-A4,
     guideline v2, stronger model, parallel batches) and the 40-page audit Doc.
   - Ledger: 146 paid dev requests, $0.04; 41 local-model requests.
