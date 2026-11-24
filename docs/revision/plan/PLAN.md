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
- 2026-11-23 Agent: milestone 13 built (7-page anonymous Word/PDF, response letter Doc); waiting for the owner's check. Next: act on the owner's comments; submission stays with the owner/Kevin.
- 2026-11-23 Owner: "for your q, a" (A: align the extension to the evaluated output-only check; remove the caveat in Sections 4.2 and 6). Milestone 13 check still pending.
- 2026-11-23 Owner (m13 check): "1. fig resolution not enough. 2. table width should fit content. and bold best values. 3. highlight parts that you have made major changes. 4. letter should be polite and quote the newly added/revised part directly. 5. ref citation should be shorthanded so we can add more analysis". Page-rule A/B left unanswered (keep 7).
- 2026-11-23 Owner: "cut the mentioning on earlier run. you can use the space for more results details."
- 2026-11-23 Owner on the abstract results: "you explanation is poor. the point is how much better our tool is and how much saving it can be. you give numbers with no obvious meaning". Abstract rewrite authorized (abstract hash updated).
- 2026-11-23 Owner: "we need to settle down on that abstract together first. And then you carry out the idea from the abstract to the rest of the manuscript". Abstract positioning agreed with the owner before further manuscript changes.
- 2026-11-23 Owner on the abstract draft: "The position is okay, but the writing is very, very bad... adding too much information into one sentence... Only adding information that helps to justify your story... What is meant by web reading? ... this will be called as a semi-structural data... not structured enough so you can use some SQL language to process it". Positioning A accepted; rewrite in short sentences, frame the data as semi-structured.
- 2026-11-23 Owner: "1.7 times as often as Mozilla Readability, the reader built into Firefox - poor way to explain the benefit"; "100,000 page views ... pretty arbitrary ... a very bad choice of showing the number". Reframe benefit and saving without arbitrary scale.
- 2026-11-24 Owner: "you're showcasing the relative number when necessary, saying we can recognize 46 out of 100 pages... seems very low, but you need to do the comparison to the best tool out there... how much percentage higher than that one?"; on cost: "the way you present it makes no sense... 1 cent, whatever, like what's the saving... Earlier you mentioned about it's over millions of views under how much dollar. That's the point". Show percent higher than Readability, and the total cost over a large number of views versus per-page generation.
- 2026-11-24 Owner: "No, it's too hard to read. So what scenario? ... how people would know what is renewal every month means? ... running a model on every page. Like, what does that mean? ... how people are supposed to know that is you're using these numbers for comparison?" State the scenario explicitly and name both options being compared in plain words.
- 2026-11-24 Owner: "No, very, very bad. This is abstract, right? You have no space to explain everything in so many words. What's the key message you want to deliver?" State the key message first; results in two short sentences.
- 2026-11-24 Owner: "A" (key message and two-sentence results accepted: 67% more often than Readability; under USD 1 a year vs more than USD 3,000 for a million views). "I don't understand your earlier question 2, which makes no sense." Re-ask the per-page cost source in plain words.
- 2026-11-24 Owner: "A" (per-page cost: say it was measured with the same model on the same 120 pages, no earlier-run mention; the earlier run's other results come out of the paper).
- 2026-11-24 Owner: "A" (short abstract accepted; carry it through the manuscript). "codex usage is running out, so you should not using that. Just run that yourself. If you need, you can call a Sonnet subagent to review your work, but you need to identify the correct review skill first."
- 2026-11-24 Owner: "B is ok" (abstract: "a widely used tool" instead of "the leading existing tool"; "when a rule is used, ... the page stays on the device" instead of "the page is not sent to an AI provider").
- 2026-11-24 Owner: "You can narrow the highlights parts" (highlight only the passages the letter quotes).
- 2026-11-24 Owner: "When you adjust table width, did you consider heading? With more room, you can include more details in exp, what can be added?"
- 2026-11-24 Owner: "What can be added to help with reviewer comments" (map possible additions to reviewer points).
- 2026-11-24 Owner: "A and c. Ablation is no longer needed as we are dropping the fallback, just make sure we are clear in response and never mentioned the fallback in methodology" (add cost sensitivity and results by page type; remove the fallback from the method and say so clearly in the letter).
- 2026-11-24 Owner: "the writing in general are very, very bad ... it sounds like a general study report because it's kind of lacking the point ... how would you expect people understand which column is our work and which ones are for comparison? ... your choice of column widths are still questionable. I feel like you need to build a proper skill for that ... quite AI-ish writing ... a readability skill you can borrow from the proposal agent ... only after you fix the first issue ... do the analysis first and let me know your understanding of the issue I'm talking about before you actually making the changes"
- 2026-11-24 Owner: "a" (go ahead: fix points and names first, then the table-width skill, rebuild, then the readability pass).
- 2026-11-24 Owner: "codex is available. you can use" (run the readability pass with the readability-check Codex readers).
