# AIIPCC69233 revision

Tracked plan for the revision; milestones.json holds the milestone list and status. The detailed
state and history stay in REVISION-PROGRESS.md (repository root).

## Purpose / Big Picture (owner's words)

Goal (confirmed 2026-11-20, extended 2026-11-23): answer the AIIPCC69233 reviewers with new
evidence and a revised paper by the submission deadline 2026-11-26. Redesign how rules are
generated and evaluated so the agent's contribution can be measured fairly ("improve the agent's
capability of creating a better site wise rule. the goal is to surpass the existing rule base
methods", 2026-11-21), add the privacy safeguards the reviewers asked for, rerun on a larger
corpus, then revise the manuscript. The paper's claim is low-cost access to AI services ("the
true accessibility we are claiming is access to AI service with low cost. That's the main
contribution of this paper and those disclaim should not be softened or diminished", 2026-11-23);
it makes no low-vision usability claim (no user study).

Done means:
- The site-wise agent rule beats the deterministic reader and Mozilla Readability on held-out
  pages, with site-clustered intervals, reported as measured.
- Rule generation is an evaluated multi-page agent procedure scored against references
  independent of the reader; 40 sites x 5 pages corpus, with a user/Randy audit of about 20% of
  the references.
- Comparators, ablations and a second model on the same pages; extension sends minimized,
  de-identified input, discloses and asks before generating, offers fallback.
- Sanitized results exported to the paper project.
- Revised manuscript in the VDE template, at most 7 pages, anonymous, with a point-by-point
  response letter, checked by the user. Submission stays with the user/Kevin.

## Decision Log

- 2026-11-20 Owner: "the task is quite straight forward... no need to stop for me to review. you can continue all the way"; reference audit (milestone 4) stays with the user/Randy, in parallel.
- 2026-11-22 Owner: "A" to fix the two bugs first (milestones 8-10 added); no-rule sites are a bug.
- 2026-11-23 Owner: "A" v6 is the main result, v5 reported as the earlier run.
- 2026-11-23 Owner: claim = low-cost access to AI services at full strength; no low-vision usability claim; run the local model and Codex on the latest code (milestone 10b); "A, I want you to carry on everything without me, unless something is out of expectations".
- 2026-11-23 Owner: "b" keep all four self-citations [3]-[6], cited in the third person. Page budget up to 7 pages; title stays.
- 2026-11-23 Owner: "your message missed the progress and goal. you need to fix that before you continue". Plan registered here; every milestone report states the goal and the milestone status. Next: milestone 13 builder fixes.
