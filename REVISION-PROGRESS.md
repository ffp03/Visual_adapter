# Visual Adapter revision (AIIPCC69233) progress

## Goal block: methodology and extension revision (started 2026-11-20)

Status: confirmed by the user 2026-11-20 ("the task is quite straight forward... no need to stop
for me to review. you can continue all the way"). Change 2026-11-20 on the user's word: the
"(user checks)" milestones no longer stop the work; progress is shared and work continues. The
reference audit (milestone 4) is still done by the user/Randy, in parallel. Design: docs/revision/DESIGN-2026-11.md.

**Milestone status (2026-11-23 ~18:40 UTC; tracked plan docs/revision/plan/, registered for this
conversation, `plan.py start docs/revision/plan` prints the briefing):**
- [x] 1-3 pilot design, pilot corpus, agent loop prototype (superseded by the 12 development sites)
- [ ] 4 corpus 40 x 5 and references DONE; ~20% audit NOT done (user/Randy; paper says unaudited)
- [x] 5 extension changes; owner A 2026-11-23: extension and runtime now use the evaluated output-only check and prompt
- [x] 6-7 freeze v5 evaluation and export (2026-11-22)
- [x] 8-10 bug fixes, clutter fix, freeze v6 on 40 sites: page pass AI 45.8 vs P1 27.5 vs P0 24.2 (higher is better)
- [x] 10b local model 41.7 and Codex 43.3 on v6
- [x] 11 response plan Doc (user chose self-citations B)
- [x] 12 manuscript sources revised, numbers traced, claim review acted on (paper repo e0a0db9)
- [ ] 13 Word/PDF <= 7 pages anonymous + response letter (user checks) <- it6 checked by the user 2026-11-23; acting on comments (abstract first)

**Current step:** milestone 13 is built and waits for the user's check (submission stays with the
user/Kevin). Every milestone report to the user states the goal and this status (user, 2026-11-23:
"your message missed the progress and goal").

M13 OWNER COMMENTS 2026-11-23 ~20:00-21:10 UTC (in progress; see PLAN.md Decision Log): 1 figure
resolution, 2 tables fit content + bold best, 3 highlight major changes, 4 polite letter quoting the
revised text, 5 shorthand references; then "cut the mentioning on earlier run", "abstract explanation
poor: how much better and how much saving", and "settle the abstract together first, then carry it
through the manuscript". Done in paper repo (uncommitted, it7 preview built, Word export ok, 7 pages):
builder (tools archived to archive/2026-11-23-manuscript-v4-tools-pre-it7/): **bold** and ==highlight==
inline markup, table widths fitted to content with Times metrics (centred), SVG figure + PNG fallback +
doNotAutoCompressPictures (PDF figure now vector), short references (SHORT_VENUE/SHORT_URL, DOIs kept),
citations as ranges [3-6], caption prefix space fixed after the preview. Drafts: bold best values in
Tables 3-4, non-load-bearing earlier-run mentions cut, paired page outcomes and near-miss detail added
(number trace updated), abstract/results/conclusion reworded (ABSTRACT_SHA updated). TODO: SVG arrowheads
do not render in Word (markers): convert markers to polygons; "No" label overlaps its box. OPEN with the
owner: abstract positioning (proposal in chat); where the per-page cost G comes from (earlier run); then
highlight passages, letter rewrite (quote highlighted text), Section 5.4 cut, rebuild it8.

IT8 2026-11-24 ~01:00-01:45 UTC (owner agreed the abstract, cost source A, no Codex: "run that yourself";
Sonnet review allowed via the right review skill = paper-agent phase4 4b coherence pass). Paper repo
(uncommitted): drafts archived to archive/2026-11-24-drafts-pre-it8/; new short abstract (key message:
67% more often than Readability; under USD 1/yr vs > USD 3,000 at 1M views/yr), intro rewritten
(semi-structured data), 5.4 earlier-run section removed, G described as same model same pages, cost
table per website per year (1k/100k/1M views), per-site detail, discussion/conclusion; == highlights on
major-change passages; figure arrowheads as polygons + No label moved (old figure archived to
archive/2026-11-24-figure-pre-it8/); it7 outputs archived to archive/2026-11-23-revision1-iterations/it7;
it8 docx built, PDF exported (7 pages, page 7 mostly references). Letter v2: make-letter.py (v1 archived
in letter/archive-2026-11-23-letter-v1/) quotes 30 passages verbatim from the built docx; not yet
published (publish-doc.py creates a new Doc; use response-letter-v2.json). NEXT: Sonnet coherence pass
-> artifacts/coherence_issues-it8.md; add per-site table (Table 4, cost becomes Table 5; letter Table
refs); rebuild, export, inspect, publish letter Doc, commit paper repo, send PDF + Doc link to owner.
DONE 2026-11-24 ~02:10 UTC: Sonnet coherence pass (artifacts/coherence_issues-it8.md, 25 issues): applied
privacy wording when a rule is used, "model cost", "clean pass" renamed "unit-level pass", break-even
labels, unrounded-G caption note, discussion clutter wording, "Other models"; kept owner-approved abstract
wording and reviewer-answering detail (R1.7 limits, R1.8 tokens). Per-site Table 4 added (cost now
Table 5). Final it8 PDF 7 pages, all pages inspected; paper repo 7ed6996. Letter v2 Doc
1Jd6GxvEMBwlURNieewrM2SIt-aRCuGHXWRsqb9prb-4 (30 verbatim quotes). Waiting for the owner's check.
Flagged to owner: abstract "leading existing tool" and "page is not sent" wording (reviewer said
overclaim risk); compiler/cue ablations no longer in the paper (R2.5 answered without them).
IT10 2026-11-24 ~03:00 UTC: owner "B is ok" (abstract: "a widely used tool"; "when a rule is used ... the
page stays on the device"); owner "narrow the highlights": tools/manuscript-v4/narrow_highlights.py
highlights only the 29 passages make-letter.py quotes. it8/it9 archived; it10 PDF 7 pages inspected.
Letter v3 Doc 18Nf-Vt8PsV5nO0DoqDr_nih6I4Qdy5d9bxeCNQvENss (supersedes v2). Waiting for the owner's check.
IT11 (in progress, 2026-11-24 ~03:20 UTC): owner asked whether table widths consider headings (they did
not: only the longest header word) and what experiment detail to add. Done, not built: fitted_widths
gives spare width to wrapping headers (tool archived to archive/2026-11-24-manuscript-v4-tools-pre-it11/),
Tables 4/5 headers shortened. Offered additions (owner to choose): A results by page type (manifest.json
category per eval site; rule/Readability/deterministic passes per category, e.g. docs with sidebars 6/0/6,
forums 9/6/5, product+listing 0-1 for all); B pass rate at looser clutter limits 5/10/15/20%: rule
45.8/62.5/72.5/75.8, Readability 27.5/32.5/34.2/36.7, deterministic 24.2/38.3/58.3/68.3, local
41.7/52.5/59.2/66.7 (per-page.csv; 5% reproduces Table 3); C worked example figure. Owner then asked "what can be added to help with reviewer comments": offered A cost
sensitivity (R1.3; break-even per year vs renewal none/quarterly/monthly/weekly and mean/max F: 2.6/3.4,
13/17, 34/44, 138/178; max F 7/9, 36/47, 95/122, 386/496; yearly 0.01/0.05/0.14/0.55 USD), B compiler
ablation sentences (R2.5; v5 one-shot unit-level pass 5.0 fresh / 3.3 shared, without compiler repairs
21.7 / 25.8; needs owner OK as earlier-run content), C page types (R1.1, R3.4), D looser clutter limits
(R1.2, R3.4), E disclosure measured from logged payloads (R3.9, R2.6; ~30 min, no model calls).
Owner chose 2026-11-24 "A and c" and dropped the ablation ("we are dropping the fallback ... never mentioned
the fallback in methodology"). Applied in it11: Table 5 page types (05_evaluation 5.2), Table 7 sensitivity
(5.4); fallback removed from Sections 1-3 and 6, Table 1 column, Table 2 row and Figure 1 (box "Not applied /
Failure recorded"; old figure in archive/2026-11-24-figure-pre-it11/); deterministic reader now "the rule-free
reader of the submitted version". Letter make-letter.py (v3 copy archived): R1.1, R1.2, R1.3, R1.4, R2.4, R2.5,
R3.4, R3.5 updated (fallback and compiler removed; Tables 5/6/7). Drafts pre-it11 archived. site-categories.csv
added to the V6 export; number trace it11 rows. It11a (7 pages) inspected: Section 4 still described the basic
reader shown when no rule passes; removed (running example, 4.2 sentence, "Basic view" switch). It11b export running.
The extension code itself still shows the basic reader; the paper no longer describes it.
It11b built and exported: 7 pages, inspected, no fallback wording left. PDF drafts/aiipcc2026_revision1.pdf.
Letter v4 (33 verbatim quotes): https://docs.google.com/document/d/1Xa0X_DS2fjcjvS6FoS2yX72cvQierDnn4OMVEXDjt2Q/edit
Waiting for the owner's check of it11b and letter v4.
OWNER 2026-11-24 (after it11b): writing "very, very bad": (1) reads like a study report, lacking the point (e.g.
Table 6: three columns, no message, no way to tell which column is ours); names for our method vary (AI rule,
AI-written rule, the rule, shared rule, Visual Adapter...); column widths still questionable, build a proper skill;
(2) AI-ish writing: borrow proposal-agent-v2 readability-check, only after (1). Asked for analysis first, no changes.
Analysis sent: per-section missing points, naming census, table-width faults, proposed fix order. Waiting for answer.

OWNER A DONE 2026-11-23 ~19:30 UTC ("for your q, a"): the shipped path now equals the evaluated
procedure. New backend/agent/runtime-procedure.cjs: RUNTIME_PROMPT = loop SYSTEM_PROMPT + '\n' +
backend/agent/evaluated-guidance.txt (= guidance-m10.txt; sha256 9126b73e = v6 freeze promptSha256;
CRLF normalized, .gitattributes -text; runtime refuses 'runtime-prompt-not-evaluated' on drift),
RUNTIME_CHECK 'output'. runtime.cjs runRuntimeInduction passes both; runtime-disclosure.cjs previews
RUNTIME_PROMPT; content.js useTime(..., {check:'output'}) and rejection detail falls back to
reasons. Tests: 3 new in runtime.test.cjs (prompt/check, disclosure hash = first sent payload,
extension output check); browser.test.cjs takes CHROME_PATH/BROWSER_HEADLESS and closes the
install setup tab (runs under xvfb-run on claude-host). Local: 54/54 unit, browser 1/1. Codex review
(dilab-5080): 4 findings; fixed CRLF hash, rejection detail, weak tests; not changed: output gate
admits a rule whose anchors match 0 at induction (evaluated behaviour; use time checks counts and
falls back; paper states it). Full offline suite (ld, dilab-5080, eval-run check): agent+eval 166/166 pass; capture suite timed out
(needs Google Chrome, absent on the worker; known since 2026-11-21; capture code untouched). Receipt
workspace/revision/ld-out/checks-1795463371381/. .ldignore now skips workspace/revision/results/ and
payloads/ (1.4 GB of finished outputs stalled the upload for 30+ min).
Paper: Section 4.2 rewritten (extension and backend use the evaluated check), limitation 6 drops
the mismatch; number trace row updated; it6 PDF 7 pages, pages 1-3 identical to it5, 4-7
inspected; paper repo f68aaee. Letter unchanged (it never mentioned the mismatch).

MILESTONE 13 BUILT 2026-11-23 ~18:30 UTC (paper repo 92808ee): drafts/aiipcc2026_revision1.docx +
.pdf, 7 pages, anonymous (core creator Anonymous, PDF author empty), every page inspected (5 Word
iterations; archive/2026-11-23-revision1-iterations/). Route: Word is not on claude-host; ld job on
dilab-pc2 (Word 16 on pc1/pc2/pc7 only) runs tools/manuscript-v4/word-export-ld.sh (export.ps1 as
ldworker) and renders PNGs; tools README documents it. Builder fixes (originals archive/2026-11-23-
manuscript-v4-tools-pre-m13/): portable paths, abstract SHA d86130ed, 13-20 refs, verified ref
snapshot tools/manuscript-v4/archive/m13/, full reference formatter (venue/series/volume/pages/
publisher/DOI or URL+access date; TACCESS and UIST venues written out in references.bib), widths
for 4 tables, suppressAutoHyphens (R3 hyphen artefacts came from Word auto-hyphenation), table rows
keep with captions, refs left-aligned. Figure relabelled (draw_figure.cjs, portable; old figure
archive/2026-11-23-figure-pre-m13/). Table 1 moved after the Co-Scraper paragraph (02_related_work.md,
full_paper.md reassembled) so it fits with its caption. Response letter (2,213 words, point by point
R1.1-R1.9, R2.1-R2.6, R3.1-R3.9): Google Doc
https://docs.google.com/document/d/1iRwIXp6LfCW6ug9nZDCKvfx1yboKfyrZ0LK4VaF_yh0/edit (verified;
source workspace/revision/response/letter/make-letter.py -> response-letter.json; service record
va-m13-response-letter-doc). Not done: no Codex review of the render or letter (docs; own checks).
Open for the user: milestone 13 check; A/B extension check alignment (unchanged). Nothing running.

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

**Manuscript revision (proposed 2026-11-23, waiting for the user's agreement):** review reports
received (paper repo inputs/reviews/2026-11-19-AIIPCC69233/, 3 docx: R1 72 major, R2 74 major,
R3 76 accept with major). Page budget: 7 pages before the extra-page fee (now 5). Proposed:
11. Response plan: each reviewer point -> change + evidence, in a Google Doc. (user checks)
12. Revised manuscript sources (paper repo drafts/*.md): v6 method and results, cost model
    instantiated from the ledger, comparison table, threat model, softened access claims,
    reference/format fixes. Check: every number traced to an export; Codex claim review.
13. Word/PDF in the VDE template (<= 7 pages, anonymous) plus response letter. Check: rendered
    pages inspected. (user checks) Submission stays with the user/Kevin.
Asked: 1 access claims (A soften, no user study), 2 page budget (A up to 7), 3 milestone list OK.
User 2026-11-23: access = low-cost access to AI services is THE claim; keep it at full strength and
make it clearer; do not claim low-vision usability (no user study). Also: run the local model and
Codex on the latest code (freeze v6) "to complete the tests" -> milestone 10b, before 11. Taken as
agreement to 11-13 and 7 pages (carry-on order). 10b plan: P4-Codex on the frozen v6 subset
eval-01..10, then P4-local on 40 sites, both on claude-host one process per site (local model is
served via the image portal 100.106.192.82:8780 on dilab-pc11; ld on 5080 cannot reach it, 5090 is
off limits); unpaid, so ledger caps are not touched; generation.lock = one policy at a time.
STATE 2026-11-23 14:45 UTC: 10b P4-Codex DONE on eval-01..10 (first eval-01 try hit the runner's
10 s login check before any request -> archived workspace/revision/archive/m10b-codex-login-failure-
2026-11-23/ with README, site rerun; disclose in export). P4-local eval-01 checked (4 requests, own
output on 3/3), eval-02..40 RUNNING in background (scratchpad m10b-run.sh, log m10b-local.log,
~3 min/site, expected done ~16:30 UTC; watchdogs: cron 15:13 + host 15:38). score-v6.cjs now also
reads P4-local/P4-Codex (pre-edit copy archived). First 10 sites page pass (higher is better): P4-on
60.0, Codex 43.3, P1 26.7, P0 13.3. Next for 10b: score all, export-v6 update (add the two policies
+ paired vs P4-on/P1/P0), Doc update. Milestone 11 response plan Doc published (text-verified):
https://docs.google.com/document/d/1l_5S7kZ6x1CFMEHjQtfhFM1JO1jzhTTuKjfSDeYkH30/edit (source
workspace/revision/response/response-plan.json); open decision: self-citations [3]-[6] A keep 1-2
third person (recommended) / B keep all / C anonymous -> USER CHOSE B (keep all four, third person). Then milestone 12 (Markdown sources in the
paper repo drafts/; tools/manuscript-v4 builds; Word PDF export needs Windows Word).
10b DONE 2026-11-23 ~14:50 UTC: P4-local 40/40 sites (172 requests, unpaid, ~40 s/site), P4-Codex
10/10 (53 requests). Page pass (higher is better): DeepSeek 45.8, local 41.7 [30.0, 54.2], Codex
43.3 [20.0, 70.0] (30 pages), P1 27.5, P0 24.2; local-P1 +14.2 [-0.8, +29.2], local-P0 +17.5 [+5.8,
+29.2], Codex-P1 +16.7 [+3.3, +30.0], Codex-P0 +30.0 [+6.7, +56.7], Codex-DeepSeek -16.7 [-40.0, +0.0]
on its 10 sites. Clean pass (higher is better): local 41.7, Codex 70.0; noise leakage (lower is
better): local 22.2, Codex 7.1; content recall (higher is better): local 86.5, Codex 94.1. P0/P1/P4-on
unchanged. scores-v6.csv 510 rows (3-policy copy archived). Export regenerated in place in the paper
repo (017fcc2; old 3-policy files git mv'd to archive/2026-11-23-v6-export-three-policies/).
export-v6.py extended (old copy archived). m10-lab.sh mode C exit status fixed (old copy archived).
Service records: google-workplace (plan Doc), codex, local-llm. No results Doc update (table in chat).

START HERE (milestone 12, after the 2026-11-23 15:00 wrap): revise the manuscript sources in
~/Dev/paper-agent/workspaces/visual-adapter-aiipcc-2026 (own git repo, main): drafts/00..06_*.md and
full_paper.md (prepare_inputs.py requires full_paper.md == section assembly). Read first: paper-agent
agent/instructions/shared/writing_style.md, the response plan (workspace/revision/response/response-
plan.json = the Doc), reviews in inputs/reviews/2026-11-19-AIIPCC69233/ (text extracted in plan),
exports inputs/results/2026-11-23-revision-evaluation-v6/ (main) and 2026-11-22-revision-evaluation/
(v5 earlier run: P2, compiler ablation, P3, cue ablations). Decisions: claim = low-cost access to AI
services, full strength, clearer; no low-vision usability claim; title stays; <= 7 pages; keep all
four self-citations [3]-[6] in the third person (user "b"); v6 main, v5 the earlier run. Rewrite the
method/case study for the v3 agent loop (rules induced on p1-p2, output-only check, use-time anchor
check, reader fallback not scored), cost instance from the ledger (F per site 0.0104 USD DeepSeek;
G per page: v5 P3 0.0020, P2-fresh 0.00155), threat model (verify each claim in extension/ and
backend/ code first), comparison table, per-failure breakdown, reference fixes, format fixes. Every
number traced to an export file; then a Codex claim review (codex-budget first). Milestone 13 =
Word/PDF via tools/manuscript-v4 (PDF export needs Windows Word) + response letter.
MILESTONE 12 DONE 2026-11-23 ~18:15 UTC. Paper repo commits e4e38f7, e0a0db9 (+ trace fix): drafts
00-06 + full_paper.md rewritten (claim = low-cost access, full strength; no usability claim; v6 main,
v5 earlier run; agent method; threat model; comparison table; cost instance; failure breakdown),
references fixed (arXiv DOIs, PAL/AWM ICML PMLR, FrugalGPT TMLR, WebArena ICLR, [3] editor Roger Lee +
Cham, Mind2Web pages, W3C FPWD 2016 labelled, pricing model version + access date, Readability 0.6.0
added; 19 refs). Submitted sources archived archive/2026-11-23-submitted-manuscript-sources/. New
export inputs/results/2026-11-23-cost-instance/ (workspace/revision/export/export-cost.py): F 0.0104
per site at peak (v5 recorded USD was partly off-peak; all figures now peak), G 0.0040 (P3) / 0.0031
(P2-fresh), break-even 2.6/3.4 views, 34/44 with 12 renewals. Number trace artifacts/number-trace-
2026-11-23.md (all numbers to exports or code). Codex claim review (dilab-5080, gpt-6.1-sol medium):
31 findings, all numbers matched; acted on the valid ones (privacy/trust boundary as implemented:
local disclosure preview sends sanitized page to the loopback backend, backend unauthenticated,
images load from origin, synced preferences; evaluated vs prototype checks; anchors not checked at
admission and may allow 0; renewal only via report; provenance model-written; measure definitions;
eval-38 mixed family; v5 clean pass fallback-inclusive with own-output rates 22.5 etc.; wording
"passes more pages"/"similar pass rates"/"model cost"; table with R1's six dimensions, Co-Scraper
fallback, SkillWeaver preconditions, FrugalGPT cascade). Not acted: self-citation anonymity (user's
decision B). Review record: workspace/revision/response/claim-review-m12/. No re-review (fix round).
OPEN FOR THE USER (asked 2026-11-23): A align the extension to the evaluated output-only check
(content.js useTime {check:'output'}, runtime runLoop check 'output', tests; then drop the caveat in
the case study + limitations; recommended) / B keep code, keep caveat. Not blocking milestone 13.
START HERE (milestone 13): Word/PDF in the VDE template <= 7 pages anonymous + response letter.
Draft is 5,396 source words, likely over 7 pages: trim against the actual render (main candidates:
04 case study, 05 earlier-run and cost paragraphs). Builder work in tools/manuscript-v4 first (copy
to an archive before editing): prepare_inputs.py ABSTRACT_SHA (abstract changed) and reference
envelope 18 -> 19; build_docx.py reference formatter prints no DOI/series/volume/publisher/editor/
note/access date and maps the venue to "Comput. Inf. Sci. Eng." (cause of the reviewers' reference
complaints); section numbering for Case Study and Discussion; figure relabel via draw_figure.cjs
(no compiler; agent induction on two examples; admitted version published; failed check -> fallback;
report -> renewal within budget); table header wrapping; paths target Windows (ROOT C:\Dev\paper-
agent), Word COM export (export_checked.py) needs the Windows laptop: check how earlier builds ran
(paper repo TASK-023-PROGRESS.md, tools/manuscript-v4/README.md). Response letter: point by point
from response-plan.json + the coverage list in claim-review-m12/codex-m12-claims.out. User checks
milestone 13; submission stays with the user/Kevin. Nothing is running; no watchdogs.

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
   DONE 2026-11-22 21:20 UTC: 117 DeepSeek requests over the 12 dev sites (laptop ran the 5 large
   ones), all generated, 0 output-limit (59 with thinking); 12 sites re-scored, AI rule only:
   P4-on page pass 44.4 (run 7: 47.2; the one page lost is dev-11-p3 at 9.8% clutter, 5% line),
   P1 19.4, P0 11.1, AI-P1 +25.0 [+11.1, +41.7]; P4-off rule on 8/12 sites (no rule: dev-01, 03,
   04 use-time, 08). Table: analysis/2026-11-22-m8/table-12sites.txt (scores-12.csv). dev-12 fails
   for every reader on order only (2 of 715 near-identical units cannot be placed, tau set to 0).
9. Find why the agent misses the remaining clutter on the other failing pages, and fix the
   cause. Check: before/after table on development sites. (user checks)
   DONE 2026-11-23 (user's "A", ticked on the offline estimate, no re-run): cause = narrow clutter
   definition in the instructions ("retain author and date metadata", "evidence-backed" removals);
   fix = guidance-m9.txt (iteration 9, 52 requests). Table analysis/2026-11-22-m8/estimate-m9.txt:
   m8 with check 44.4 / clutter 6.7 / kept 100.0 -> m9 no check 44.4 / clutter 4.9 / kept 99.4
   (page pass higher is better, clutter lower is better); AI-P1 +25.0 [+0.0, +50.0], AI-P0 +33.3
   [+13.9, +55.6]. The no-check figure assumes the agent stops at the rule the check refused.
10. Rerun P4 on the 40 evaluation sites with the fixes, scored on the new measures.
   DONE 2026-11-23 07:50 UTC: freeze v6 5ae6dac2 (output-only check, iteration 10), P0/P1/P4-on all
   generated fresh, 40 sites x 3 held-out pages, AI rule only (3 fallback pages = fail). Page pass
   (higher is better): AI 45.8, P1 27.5, P0 24.2; AI-P1 +18.3 [+3.3, +32.5], AI-P0 +21.7 [+7.5,
   +35.8] (site-clustered, 10,000, seed 20261122). Clutter (lower is better) AI 7.9 / P1 9.9 / P0
   17.3; content kept (higher is better) AI 99.4 / P1 82.9 / P0 99.8. AI failing pages: clutter >5%
   57, title 6, order 8, content 3, no output 3. Sites by AI pages passing of 3: 0:15, 1:7, 2:6, 3:12.
   Eval cost 151 requests, $0.42; ledger 2,057 paid / 871 dev / $2.26. Files:
   analysis/2026-11-23-m10/{scores-v6.csv,table-m10.txt,score-v6.cjs,table-m10.py}; jobs A 305483, C 305484.
   (Original text:) Needs the user's OK for DeepSeek requests beyond the 2,000 cap.
   Detail proposed 2026-11-23 (waiting): code a no-check mode (keep only "rule produces output"),
   Codex review of all uncommitted code, freeze; dev-02 as the one-case check; then P4-on on the
   40 evaluation sites once (~190 requests at ~4.7/site, ~$0.30 at iteration 9's $0.0015/request);
   cap 2,000 -> 2,300 requests, $5 unchanged. Check: table vs P1/P0 with site-clustered intervals.
   AGREED 2026-11-23 (user "A"; "carry on everything without me, unless something is out of
   expectations"). Plan: Codex (dilab-5080, brief scratchpad codex-m10-brief.md) implements
   check:'gate'|'output' (procedure-v3 gate/useTime/selectFamily, Views, runLoop, Families,
   capability-run, eval-run), ledger ceiling 2300, eval freeze schemaVersion 2 (v6) bound to a
   settled dev iteration pointer (workspace/revision/dev-runs/m10/final.json), verify rechecks the
   test receipt (finding 4), v6 generation lock (finding 6), no carry (P0, P1, P4-on all fresh
   under v6). Then: apply + targeted tests; Codex review of all uncommitted code; dev iteration 10
   = guidance-m10.txt (m9 guidance + one check-mode sentence) created after review; ld job A:
   offline checks receipt (eval-run check) + dev-02 output-mode check; archive v5 freeze/manifest
   to freeze/archive/v5 and freeze v6; ld job B: eval-01 P0/P1/P4-on, inspect; ld job C: other 39.
   Checked 2026-11-23: all 200 eval sources and references match the v5 manifest; files changed
   since v5 = ledger.cjs, loop.cjs, runners.cjs, procedure-v3.js (WP-F1/m8) only.
   STATE 2026-11-23 ~05:00 UTC: Codex implementation job 19fb5b56... (dilab-5080) DONE, patch
   .git/codex-remote/19fb5b56f90c49248259d2db129488d0.patch APPLIED to the working tree (originals
   archived in workspace/archive/2026-11-23-m10-pre-codex/; CRLF kept). Targeted tests here (heap
   900): procedure 23, loop 10, ledger 6, eval-v6 6, evaluation 15, eval-v5 6, eval-carry 5,
   runners 14, regate 2, capability 6 - all pass. Codex REVIEW of all uncommitted code RUNNING
   (brief scratchpad codex-m10-review.md, output scratchpad codex-m10-review.out; job id there;
   `python ~/.local/bin/codex-remote result ~/Dev/Visual_adapter <job>` if no notification).
   REVIEW DONE (9 findings; scratchpad codex-m10-review.out). Valid and sent to a Codex FIX ROUND
   (brief scratchpad codex-m10-fix.md, output codex-m10-fix.out, job id there): v2 capture hashing,
   required v5 archive + ordered record compare, receipt covers test inputs/commands/drift, pointer
   must match a completed output-mode dev run, visible-text output check + P3 anchor check, ledger
   idempotent settlement/over-reservation stop, run.lock cleanup. Not fixed (by choice): clutter-marking
   heuristic (advisory in output mode) and the 16,384 thinking cap (design). After the fix patch:
   apply, re-run targeted tests, then continue below.
   FIX ROUND DONE 06:00 UTC: patch .git/codex-remote/263aa7f1887646d2b2f7a52593a6c229.patch applied
   (originals in workspace/archive/2026-11-23-m10-pre-fix/); targeted tests 108/108 pass here; real
   ledger loads (1,900 paid, 865 dev, $1.83). Iteration 10 CREATED (prompt 9126b73e, output
   results/capability-agent-10-1795413772915); pointer dev-runs/m10/final.json WRITTEN. m10-lab.sh now
   runs its container as root, installs Chrome for the capture tests in mode A (as check-docker.sh
   did), chowns workspace/revision back on exit. Submit it DIRECTLY (not via in-place.sh: it runs its
   own docker). JOB A SUBMITTED 06:27 UTC (ld --only needs --reason; added). ~1 h. Then continue below.
   JOB A DONE 06:42 UTC (all steps ok, 10 paid requests): Chrome installed, checks ok (receipt
   evaluation/checks-1795415843679), dev-02 output mode 3 rows (completion P4-on-complete-1795415931275),
   v6 FROZEN 5ae6dac2 (516 files) and verified (also here), eval-01 P0/P1/P4-on done. Merged here:
   v5 freeze+manifest archived by hand to freeze/archive/v5 (identical to the job's copies), 68 run
   files copied (test litter left in ld-out-m10/stage), ledger prefix-checked 6932 -> 6963 lines
   (1,910 paid, 871 dev, $1.86). FREEZE-LOG.md v6 entry added. Code committed 928eec8.
   Scorer: workspace/revision/analysis/2026-11-23-m10/score-v6.cjs <out.csv> (frozen thresholds,
   checks output/reference hashes). eval-01: P4-on passes 2/3 pages (clutter 2.6/0.1/6.9%, content
   100%); P1 0/3 (content 7/3/100%); P0 0/3 (clutter 11/1/17%). dev-02 output mode: content 100%,
   clutter 11-14% (run 7 with gate 3%) - expected cost of no gate on that site.
   JOB C DONE 07:40 UTC (117/117 site-policy runs exit 0; the job's final "exit status 1" is the
   trailing `[ -f STOP ] &&` test in m10-lab.sh mode C, harmless). Merged (ledger prefix-checked
   6963 -> 7404), scored, MILESTONE 10 TICKED (see list). USER ANSWERED "A" (08:00 UTC): v6 is the
   main result, v5 reported as the earlier run with the dev-only fixes in between. EXPORT DONE:
   paper repo workspaces/visual-adapter-aiipcc-2026 commit 62f95b0, folder
   inputs/results/2026-11-23-revision-evaluation-v6 (README with the v5->v6 sequence, report.json,
   per-page.csv, hashes.json; script workspace/revision/export/export-v6.py; v5 export untouched).
   On the frozen v5 measures too: AI clean pass 54.2 vs P1 26.7 (+27.5 [+8.3, +45.8]) and P0 10.0;
   noise leakage AI 19.5 vs P1 8.1 (+11.4 [+2.6, +20.0], P1 better) vs P0 67.3. Fresh baselines
   reproduce v5 (P1 identical, P0 clean pass identical). v6 results Doc (private, verified):
   https://docs.google.com/document/d/1mac6d-pUZYu2G8OAyJEKYkKpMB4AfRQpf8J9Amyz7fQ/edit
   (results-doc-v6.json). Service records: deepseek, google-workplace, codex. Open, not urgent:
   MEMORY.md inbox items from 2026-11-22 (wait for change-review), delete branches
   m8-laptop-transfer / m8-laptop-results, small m10-lab.sh mode C trailing exit status 1.
   (Answered question was:)
   how the paper reports v6 vs v5 (A. v6 as the main result, v5 disclosed as the earlier
   evaluation run and the dev-only fixes in between - recommended; B. v6 as a supplementary
   result, v5 stays main). Then: export v6 like export-v5.py to paper-agent inputs/results/ (new
   folder, v5 export untouched) and update the results Doc. Nothing running, no watchdogs.
   (Done:) JOB C SUBMITTED 06:58 UTC: m10-lab.sh C eval-02..eval-40, outputs workspace/revision/ld-out-m10c
   (estimate ~2.5 h incl. upload: ~3 min per site). After it: copy run files from ld-out-m10c/stage
   (skip tests/, synthetic-*, scoreboard-test-*, payloads/locks, corpus/archive test artifacts),
   merge ledger with prefix check, score all v6 rows with score-v6.cjs, page pass as estimate-m9.py
   (recall>=.95, title, tau>=.9, clutter<=.05), site-clustered bootstrap 10,000 seed 20261122,
   table vs P1 and P0 in chat, tick milestone 10.
   (Old plan, done:) act on valid findings, THEN (not before:
   iteration snapshots procedure-v3/outline hashes) create dev iteration 10:
   `node workspace/revision/analysis/2026-11-22-m8/rerun.cjs prepare-guidance --iteration=10
   --guidance=workspace/revision/analysis/2026-11-22-m8/guidance-m10.txt` (guidance-m10.txt =
   m9 guidance + check-mode sentence, written), write workspace/revision/dev-runs/m10/final.json =
   {"iterationFile":"<RUN>/iteration-10/iteration.json"}; rerun.cjs now takes --check=output.
   ld payload workspace/revision/ld/m10-lab.sh written (untested): `A` = eval-run check ->
   dev-02 output-mode check -> archive v5 freeze (job copy) -> freeze v6 + verify -> eval-01
   P0/P1/P4-on; `C <sites>` = the other 39, one process per site and policy. Submit:
   ld submit --only dilab-5080 --secret DEEPSEEK_API_KEY --mem 8G --cpus 2 --outputs
   workspace/revision/ld-out-m10 -- env STAGE=workspace/revision/ld-out-m10 bash
   workspace/revision/ld/m10-lab.sh A. After pull: archive
   local v5 freeze+manifest to freeze/archive/v5 by hand BEFORE copying staged files; merge the
   ledger with a prefix check; inspect dev-02 and eval-01 outputs; add FREEZE-LOG.md v6 entry.
   Scoring: v6 P0, P1, P4-on rows (eval-P*-* result dirs with the v6 freezeSha256), AI rule only,
   same page-pass definition as estimate-m9.py, site-clustered bootstrap seed 20261122.
Done-means bullet 1 replacement drafted (workspace/revision/analysis/2026-11-22-goal-change/
new.txt, rule-only, higher/lower better), not adopted: open whether sites with no rule are left
out or count as failures (user called them a bug to fix first).

**Current step (2026-11-22 21:20 UTC; superseded by the milestone status at the top):** milestone 8 DONE (see list); now milestone 9. Laptop results merged
(ledger prefix-checked: 6626 -> 6764 lines, 1,844 paid, 809 dev, $1.75; pre-merge copy in
workspace/archive/2026-11-22-m8-laptop/). Branches m8-laptop-transfer / m8-laptop-results can be deleted later.
Milestone 9 cause found (iteration-8 payloads, outline.cjs suspicions()): the preview feedback's
keptBoilerplate list is in page order, capped at 40, no sizes, so tiny nav links fill it (Keychron: 40
menu items) and large clutter lower down is never shown; its output list is the first 40 elements
(Keychron: 40 of 40 empty images/li). Repeat flags are exact text, so a block with a fixed heading and
per-page body ("Frequently Bought Together", W3C "Tests" details boxes, Blogger/MDN/GOV.UK date or
URL lines) counts as unique for the agent and the gate. Proposed to the user (A feedback only /
B feedback + gate / C), with a P4-on before/after on the 12 dev sites (~60 requests; dev 809/900,
paid 1,844/2,000; large sites on the laptop again). SUPERSEDED by the user's questions (22:00):
the gate was never shown to be needed; no AI-only baseline existed. User chose A: build the
no-check baseline from saved rules (no AI requests): analysis/2026-11-22-m8/nogate.cjs (first and
last rule per site/policy from the ledger payloads, render only, scored on p3-p5) and
nogate-table.py. 7 small sites done locally (nogate.jsonl); 5 large on ld dilab-5080 (no key),
outputs workspace/revision/ld-out-nogate -> nogate-large.jsonl. Partial (7 sites, 21 pages):
P4-on first rule no check passes 13/21 vs 11/21 with check. load-dispatcher#69 is RESOLVED:
ld submit --secret DEEPSEEK_API_KEY (key held on dilab-5080), so AI re-runs need no laptop.
No-check baseline DONE (23:20 UTC; nogate-table-12.txt; large sites ld dilab-5080): page pass over all
36 pages (higher is better): P4-on first rule no check 44.4, last rule no check 44.4, with check 44.4
(identical: the check never changed a thinking-on outcome); P4-off first 38.9, last 50.0, with check
30.6 (the check refused the final rules of dev-01/03/04/08 -> no rule -> fail; -19.4 points).
First rules keep 92% of content (dev-12, dev-06 losses); the agent's later turns repair it to 99-100%.
All versions fail mainly on clutter >5% (~16 pages). Next: failure analysis of the AI's own clutter
choices (did its view show the clutter?), then report to the user.
Clutter failure analysis DONE (clutter-seen.cjs/.jsonl; P4-on, 16 pages over 5%): 11 pages the agent's
view SHOWED the clutter and it kept it (dev-01 "Originally published on Blogger", dev-03 "Help improve
MDN", dev-06-p3 GOV.UK "Updates to this page" 45%, dev-09 Keychron gallery text + "Frequently Bought
Together", dev-11 "Stay organized with collections"); 2 on sample pages but not shown (dev-08 BBC share
line, 37 chars); 1 not on the sample pages at all (dev-07-p4 W3C "Tests" boxes); 2 partial overlaps
(dev-06 p4/p5). Cause: the agent's prompt defines clutter narrower than the answer-key guideline
(DESIGN 3 noise kinds): it names only share/related/recommended/newsletter/promo/nav/sidebars, says
"retain author and date metadata", and says to remove "evidence-backed" noise (repeat-flagged) only;
author-boilerplate and widgets are named once each but undefined and tied to passing G4/G6. User chose A
(23:20): guidance-only change (analysis/2026-11-22-m8/guidance-m9.txt; system prompt and code unchanged;
iteration-9, prompt 62501d9f, output results/capability-agent-9-1795390118486), P4-on, 12 sites, on ld
dilab-5080 with --secret DEEPSEEK_API_KEY (workspace/revision/ld/m9-lab.sh, dev-02 first as the one-case
check), outputs workspace/revision/ld-out-m9. Then: merge ledger (prefix check), score with check and
without (nogate-style on iteration 9), before/after table to the user (milestone 9 check).
Attempt 1 (ld 305407) VOID: the empty output folder was not uploaded, dev-02 output write failed,
STOP after the dev-02 check (4 requests, merged into the ledger: 1,848 paid, 813 dev, $1.75; files in
workspace/archive/2026-11-22-m9-attempt1-void). m9-lab.sh now creates the output folder; resubmitted
(00:00 UTC). score.cjs labels iteration-9 rows m9; nogate.cjs takes --iteration=9.
Attempt 2 (00:45 UTC) done: 52 requests, all generated (totals 1,900 paid, 865 dev, $1.83). WITH CHECK
P4-on page pass 33.3 (m8 44.4): worse (table-m9.txt, scores-m9.csv). dev-02 3->0 (agent's own last-turn
change: its turn-2/4 rules passed 3/3), dev-04 3->2, dev-09 16->13% clutter. The gate refused the
agent's new removals on dev-01/05/06/07/08 (G4 unique-exclusion, G3, G6). Every tried rule scored without
check (nogate.cjs --iteration=9 --all-turns; nogate-m9.jsonl small sites; large on ld -> nogate-m9-large):
refused rules would have helped on dev-01 (0->2 pages, clutter 3%) and dev-06 (p3 clutter 44.5->8.2%),
were neutral on dev-05, and on dev-08 the refused rule dropped article text (93-95% kept): the one real
protection. Content kept 100% everywhere else.
Offline no-check estimate (user, 01:00: "why always rerun? we record the data"): estimate-m9.py ->
estimate-m9.txt, no new requests. Page pass (higher is better) thinking on, 36 pages: m8 with check 44.4;
m9 with check 33.3; m9 no check low (final rule) 33.3; m9 no check high (last refused rule accepted) 44.4,
clutter 4.9% (lowest so far), content kept 99.4%. High gains vs m9-check: dev-01 +2, dev-07 +1, dev-11 +1.
Losses vs m8 not from the check: dev-02 3->0 (agent's own final-turn change undid its passing turn-2/4
rule), dev-04 3->2. dev-06, dev-09, dev-12 fail in every version. Reported to the user; waiting.
User chose A (analyse last-turn regressions, saved data only). Found: dev-02 is a one-off agent slip: at
the forced last turn (after a wasted query, #recently_viewed count 0) it resubmitted a never-previewed
rule rewritten from scratch without `ul.row` (recently-viewed grid) -> 3 pages lost. Over all trials
checked (m9 12 sites; m8 small sites both settings, nogate-m8-allturns.jsonl) the submitted rule's result
differs from the last accepted preview only twice: dev-02 m9 (-3) and dev-01 P4-off m8 (+2), so "submit
the last preview" is no fix. dev-04 is not the agent: dev-04-p5 keeps 99.9% with 1.8% clutter but 1 of 264
units ("Wikimedia Commons has media...") cannot be placed, so order = 0 (same as dev-12). Proposed next
(waiting): remove the check from the loop (keep only "rule produces output") and re-run only the 6 sites
where it refused a rule in iteration 9 (dev-01, 05, 06, 07, 08, 11; ~30 requests, fits the 35 dev left),
keeping the other 6 sites' iteration-9 results (the check never spoke there). Needs a no-check mode in code.
2026-11-23: user asked "assuming the rest will be more or less the same as what we tried, do we have
everything we needed?" Answered yes for milestone 9: the before/after table is estimate-m9.txt (m8 44.4 /
clutter 6.7 -> m9 no check 44.4 / clutter 4.9, content 99.4; beats P1 +25.0 [+0.0, +50.0], P0 +33.3
[+13.9, +55.6]). Page pass flat: dev-01 +2, dev-07 +1, dev-11 +1 offset by dev-02 -3 (slip) and dev-04 -1
(order). Gaps named: the high case is an assumption (agent stops at the refused rule), one run per site,
no-check mode not coded (needed only for milestone 10). Asked: A tick milestone 9 on estimate (recommended),
B run the 6 sites first. Waiting.

**Earlier step (2026-11-22 ~18:30 UTC):** milestone 8, measured on dev, eval re-gate running.
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
