# Use the local Visual Adapter

From the project root, install the root Node dependencies if needed, then run:

```text
npm install
npm run start:local
```

Use Node.js 22.13 or newer. The backend listens only on 127.0.0.1:7861. Its health
endpoint reports the actual provider, model, attempt count and session limit.
The configured route is DeepSeek Flash with thinking disabled; the server reads
only DEEPSEEK_API_KEY from the process environment or ~/.env.shared. The key is
not included in the extension package. No Gemini fallback is used.

In Chrome, open chrome://extensions, enable Developer mode and load the project's
extension folder. For an existing installation from that folder, reload the
extension and refresh open website tabs so their content scripts are updated.
Open the Visual Adapter side panel from Chrome's extensions menu.

## What runs locally

Local mode sends lookup, admission and generation requests to the loopback
backend and keeps rules and usage under workspace/local-ai/<provider>-<model>.
It does not use production Firebase. Cache state persists across server starts.
The basic reading view remains available when a procedure is unavailable or
rejected. An incompatible procedure does not automatically start paid renewal.

The browser inspects the full source DOM and sends a balanced model sample with
a 12,000-character ceiling. The model proposes selectors and exclusions. Full
sanitized BODY context is separate and supports deterministic validation: up to
100,000 characters uncompressed, or 1 MiB decoded through the lossless gzip route,
with a 128 KiB compressed limit and 100:1 ratio limit, inside the 262,144-byte request
bound. Incomplete or unsupported contexts retain the basic view. These limits
and role checks do not establish semantic completeness or WCAG conformance.

The first valid example creates a provisional procedure. A second distinct
identity and content example must pass that same procedure before it can enter
the shared local lookup. Each later use still checks applicability and content
preservation. A hostname can contain several incompatible layouts.

Page samples reach DeepSeek during generation. Complete sanitized validation
content reaches the local backend but is not the LLM prompt. Form values,
scripts and active embeds are removed; other page text can remain sensitive.
Routine reuse is local, while lookup metadata remains observable. This prototype
does not implement anonymous requests or a cloud distribution service.

## Session limits and alternatives

The server defaults to 20 attempted generations per session, one active request,
a 60-second provider timeout, a 1,024-token output limit and no automatic retries.
LOCAL_AI_MAX_CALLS can lower the limit to 1–20. Restarting renews the session count;
interactive use is separate from the frozen study's aggregate ledger. The
backend's defensive model-input ceiling is 30,000 characters; the browser's
structural sample is bounded more tightly. A provider failure is remembered for
that host during the session. Explicit reporting can invalidate a cached rule.

An optional `npm run start:codex` route uses Codex Luna with medium effort and
existing ChatGPT CLI sign-in. It consumes Codex allowance and has no automatic
provider switch. Its use needs the applicable authorization. No separate OpenAI
API key is required. The hosted Gemini path is legacy and was not redeployed.

See WORKSPACE_GUIDE.md for test evidence and folder ownership. Historical study
tools under tests/local must retain their frozen inputs and do not run as part
of normal browsing.
