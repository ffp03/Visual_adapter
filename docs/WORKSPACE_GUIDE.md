# Extension development and experiment workspace

Visual_adapter owns the extension, backend, tests, captured pages, provider
receipts and experiment supervisors. Keep future extension development and
evaluation inside this repository. The paper project receives selected sanitized
result exports and owns manuscript sources, bibliography, figures and rendering.

## Maintained entry points

| Path | Use |
|---|---|
| `extension/` | Actual loadable runtime; no bundling/build step required |
| `backend/local-ai.cjs` | Local DeepSeek or explicitly selected Codex server |
| `tests/local/run.cjs` | Offline regression entry point via npm run test:local |
| `tests/local/study-preparation.cjs` | Bounded evidence preparation and scoring |
| `tests/local/study-generation.cjs` | Paid study generation; requires bound plan and approval |
| `tests/local/retained-regression.cjs` | Retention regression from saved candidates |
| `workspace/maintenance/2026-10-22-extension-handoff/` | Relocation inventory and package/smoke-check evidence |

Read tests/local/README.md before running an experiment. It distinguishes
offline tests, captured-page replay, browser/API mechanism checks and paid
generation. Do not reinterpret provider doubles as fresh model quality.

## Data and evidence locations

The ignored workspace/task023 folder contains the original experiments. Its
live-20261019, holdout-20261019, preservation-v2, training-improvement,
revised-testing, ac-testing and development-metric-audit folders are historical
evidence. Their frozen manifests and captured sources must remain intact.

The final study is in workspace/task023/refresh-20261021. Its final-study-v1
folder contains the 44-page reserved study; retained-regression-v4 contains the
separate 32-page retention checks. Development used 34 pages/17 sites; reserved
evaluation used 44 pages/22 sites. All three policies passed strict reading on 39/44
pages. Shared fixed procedures passed without fallback on 29/44; per-page
procedures on 33/44. These are selected reading checks, not universal website
functionality. Tracked sanitized records and protocols are under docs/evaluation.

workspace/local-ai is the interactive cache and usage ledger, not the study
ledger. workspace/releases contains date-labelled extension ZIPs with SHA256
manifests. Disposable test profiles and generated checks remain under workspace.
The project .venv and node_modules stay in this repository.

## Material relocated from paper-agent

Fourteen extension evaluation supervision records and historical acceptance
helpers were moved into:

`workspace/task023/archive/imported-paper-agent-2026-10-22/`

The old relative hierarchy is retained. The tracked map
`docs/evaluation/organization-2026-10-22.json` records every old path, new path,
size and SHA256. Each moved file was verified byte for byte and its old copy was
removed by a move, not discarded. There are no compatibility junctions back to
paper-agent. The main test corpus and production code were already in this repo.

These imported files are historical evidence, not current entry points. Embedded
old paths and expectations are retained for provenance. In particular, the
accept_results/accept_alignment/accept_development scripts can export old results
to a paper workspace and must not be run as current tests. Maintained commands
and final evidence are listed above. Paper-only formatting/rendering tools and
immutable activity-log records remain with their owning project.

## Preservation and organization

Archive superseded files rather than deleting them. Do not rename or rewrite a
hash-bound capture, receipt or study checkpoint to tidy its name. Add an index or
a relocation map instead. Keep raw pages, local caches, browser profiles,
credentials and usage payloads out of Git and installable packages. Export only
the sanitized evidence needed by the paper. The 22 October handoff changed no
production extension/backend bytes and reran no paid inference.
