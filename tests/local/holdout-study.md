# Frozen public-source holdout harness

The TASK-023 study uses the ignored `workspace/task023/holdout-20261019/` directory. Its sealed manifest contains44 pages in22 pairs from40 candidate domains. Sources, annotations, provider artifacts and article text remain ignored. Production code and model settings are unchanged.

Run the annotation/hash regression checks with `node tests/local/holdout-test.cjs`, the cross-process budget checks with `node tests/local/experiment-lock-test.cjs`, and the independent inventory checks with `node tests/local/holdout-freeze-audit-test.cjs`.

`freezeHarness()` permits an initial freeze only when every candidate directory contains source artifacts exclusively and no provider ledger exists. It hashes all discovery, selected and unselected source/reference/capture files. Existing freezes are verified rather than rewritten. `node tests/local/holdout-freeze-audit.cjs` independently checks inventory completeness against the manifest, discovered artifacts and freeze entries, including missing artifacts and Windows path separators. Preserve its freeze hash and run this guard before and after future replays.

`node tests/local/holdout.cjs run` uses only the sealed sources and references. The study launch wrapper enforces1500 seconds. Each local Chromium measurement is bounded to30 seconds. Provider attempts use the global exclusive study lock,80-attempt/USD5 ceiling andUSD0.0625 reservation per start. Every interrupted start remains spent; no automatic retries occur. Existing provider results are replayed only after complete-context, cleaned-input, provider-output and backend-result hash checks. Accepted rules must also match deterministic frozen validation of the verified provider result.

The first page's accepted rule is reused for both shared-policy pages. Raw-rule, normalized fresh-rule, shared-rule and general fallback outcomes remain separate. A no-fallback pass requires actual rule use and every frozen content, structure, noise and URL/image check. Missing results remain failures in the fixed44-page/22-pair denominator. Full reading passes can include fallback; they must not be reported as no-fallback passes.

Timing uses Chromium141, production content code and Chrome messaging doubles, with disconnected reader HTML assignment and three repeats. Navigation, parsing and model latency are excluded from local measurements. This is not an end-to-end extension UI, WCAG or user-benefit evaluation. Sources have algorithmically selected references, sometimes broad reading regions; family labels remain unknown. The sample cannot establish general superiority.

Read `portable-summary.json` for compact results without article excerpts, `summary.csv` for per-page metrics, and `handback.json` for the complete ignored audit trail. Estimated token charges use the documented official pricing snapshot; reservation ceilings are not invoices.
