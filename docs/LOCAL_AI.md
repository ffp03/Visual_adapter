# Local AI case-study backend

The prototype defaults to `http://127.0.0.1:7861` and **DeepSeek Flash**, using `DEEPSEEK_API_KEY` from the process environment or `~/.env.shared`. The backend reads only that shared-file entry. It never puts the key in the extension, responses, logs or tracked configuration. Gemini is not called or used as a fallback.

Use Node.js 22.13 or newer and install the root dependencies. From the repository root:

```text
npm run start:local
```

Reload the unpacked `extension` in Chrome. Open a page and the Visual Adapter side panel. The first uncached hostname sends a page sample to the local backend; it requests a JSON selector rule from `deepseek-flash` with thinking disabled and a 1,024-token output limit. Later compatible pages reuse the rule. `http://127.0.0.1:7861/health` shows the actual selected provider/model and session attempt count. Change both `LOCAL_AI_PORT` and `extension/backend-config.js` if a different port is needed.

Local mode routes lookup, generation, verification and reporting to this backend, without production Firebase traffic. Cached rules and a usage ledger are under ignored `workspace/local-ai/<provider>-<model>/`. The cache persists across restarts and is shared across local tabs. Hostnames are convenient keys, not proof that every layout is compatible. A stale rule retains the heuristic reading view and does not automatically regenerate. Reporting a rule archives it and makes the next request eligible for generation. This is a local cache, not a cloud distribution service for other users.

Each server session permits at most 20 attempted generations by default, including failures. `LOCAL_AI_MAX_CALLS` can lower the limit to 1–20. There is one active generation, same-host request deduplication, a 60-second provider timeout, and no automatic retries. Each model input is bounded to 30,000 HTML characters. Restarting the server renews the session count, so a corpus experiment also needs an aggregate budget outside this process. Actual usage is recorded when available; list-price estimates do not establish billed charges.

Scripts, active embeds, event handlers and form values are stripped, but other page content can still be sensitive. The remaining page sample goes to DeepSeek on generation. This is not complete redaction, anonymity or a formal privacy guarantee. The server binds only to loopback and rejects ordinary website origins and nonlocal Host headers. Do not expose it publicly. Cached selector names can reveal page context even though the usage ledger contains only identifiers, hashes, metadata and token counters.

The backend checks selector syntax, a matching content container, and nonempty output before caching. These checks do not establish semantic accuracy or accessibility compliance. `/verify` performs deterministic local checks only; it does not start a model verification/refinement loop. This preserves fallback and avoids surprise inference calls.

The current validation also protects the actual title heading, samples substantive paragraphs/code/table content and common comment markers, and can widen a narrow selector to a stable ancestor. Table-row selections are normalized to complete table containers. Exclusions that would delete the primary heading are dropped, and the original model rule plus normalization metadata are retained. The reader keeps full content separately from the bounded model sample, resolves source links/images for the extension panel, and uses local fallback when these checks reject a rule. These are practical heuristics, not a semantic correctness guarantee.

A generation/provider failure is remembered for that host during the server session. Further requests keep fallback without another inference attempt. An explicit report or a server restart enables another attempt; neither bypasses an experiment's separate aggregate budget.

An explicit alternative uses **Codex Luna at medium effort**, with existing ChatGPT CLI authentication:

```text
npm run start:codex
```

Use `codex login` with ChatGPT first. On Windows the launcher finds the npm-installed native executable; `CODEX_BIN` can specify another full executable path. The Codex runner uses an ephemeral read-only session, a JSON schema, disabled shell/web/apps/delegation, a 60-second process-tree timeout, and a child environment without provider API keys. It consumes Codex allowance, not a separate OpenAI API key. Its model-token ceiling is not enforced by the input/time bounds. This optional route requires its own authorized inference budget. No automatic provider switching occurs.

The legacy hosted path can be deliberately selected with `BACKEND_CONFIG.current = 'production'`. Its rule lookup/reporting uses Firebase REST with the same anonymous database paths, avoiding unsupported worker imports. Live hosted-service behavior has not been checked. Its Gemini credentials are currently reported invalid by the user; it is not a working fallback.

Run `npm run test:local` for existing regressions and HTTP/cache/provider-double checks. A live routing smoke check is separate from a fresh-AI/shared-rule experiment; neither frozen paper timings nor the v1 manuscript results change merely because this backend changes.

Provider references checked 2026-10-19: [DeepSeek API](https://api-docs.deepseek.com/api/create-chat-completion/), [model and pricing](https://api-docs.deepseek.com/quick_start/pricing/), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).
