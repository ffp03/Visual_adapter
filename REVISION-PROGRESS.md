# Visual Adapter revision (AIIPCC69233) progress

## Goal block: methodology and extension revision (started 2026-11-20)

Status: drafted 2026-11-20, awaiting user confirmation of goal, "done means" and milestones.

**Goal:** answer the AIIPCC69233 reviewers with new evidence. The current design makes
agent-generated rules only match the deterministic (rule-based) reader, which defeats the
purpose of using an agent. Redesign how rules are generated and evaluated so the agent's
contribution can be measured fairly, add the privacy safeguards the reviewers asked for, and
rerun on a larger corpus. This project owns methodology and extension; the manuscript is
revised in paper-agent/workspaces/visual-adapter-aiipcc-2026. Submission deadline 2026-11-26.

**Done means:**
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

**Current step:** milestone 1 not started; waiting for goal-block confirmation.

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
   - pc11 local model connection details (user; blocks only the second-model runs).
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
5. **What is still running:** nothing.
