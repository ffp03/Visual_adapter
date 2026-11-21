# Use the local Visual Adapter

Use Node.js 22.13 or newer. From the project root run:

```text
npm install
npm run start:local
```

The backend binds only to 127.0.0.1:7861. Load the unpacked extension/ folder
from chrome://extensions (Developer mode), then open Visual Adapter's side
panel. Reload an existing extension installation and refresh its website tabs.

## Reading and consent

Opening the panel performs a host-only rule lookup. Admitted v3 rules run the
procedure-v3 use-time check against the live DOM. If it fails, the existing basic
reader renders instead. Saved v2 procedures still use their existing applicability
and preservation checks. Missing, failed and rejected rules never automatically
start generation, verification, renewal, or a provider request. The legacy
/analyze generation endpoint now refuses requests, including from older panels.

The panel shows "Improve this site's layout". To prepare its redacted cue sample,
the extension sends a sanitized BODY snapshot and its page URL/tab identifier
to the loopback backend's /disclose route. This is local-only preflight: no page
example is registered or written to disk, and nothing is sent to a model provider.
The backend uses backend/agent/outline.cjs Views, not a browser approximation.
The snapshot can contain sensitive page text. Lookup/preflight metadata is
observable locally; this prototype does not implement anonymous requests.

Click "Send and generate" to consent to retaining that exact snapshot locally.
The one-time backend-issued token binds the tab, URL and sanitized snapshot;
changing the page, refreshing its disclosure, reusing the token or restarting the
backend invalidates the consent. The first example is pending: the panel says a
second distinct page is needed, and the provider character count is zero.
A second page must have a different URL and different text and belong to the
same structural family (the existing deterministic structural descriptor). Other
families keep separate pending examples. Failed families stay in basic view until
explicitly reported or their pending examples are cleared.

With two examples, the backend runs the existing P4 runtime agent, including its
gate and ledger guard. Exact disclosure of future adaptive requests is impossible
before the model chooses its next action, so this implementation requires a
separate "Send and generate" click for **every provider turn**. Registering the
second example prepares the first request locally; it does not send it. The panel
then shows the actual provider/model, exact count and redacted sample for that
request. Each later query/outline/preview turn pauses in the same way. There are
at most six turns and no automatic provider retries. Waiting consent expires
after two minutes. The provider never receives either complete example DOM.

The character count is JavaScript UTF-16 string length of the complete serialized
provider JSON request, including system instructions, model/settings, messages
and JSON escapes. It is not a token or UTF-8 byte estimate. The displayed cue
sample is copied from the actual message content within that payload. The SHA-256
uses its UTF-8 serialized bytes and matches inputSha256 in the runtime usage
ledger. A zero-character registration click genuinely sends no provider payload.
Each disclosed request is saved locally before transport for audit.

Only a gate-admitted rule enters lookup. A third compatible page uses the saved
rule without sending page text to the provider. The always-visible Basic view
switch bypasses the rule. Turning it off tries the saved rule again. "Report
problem" immediately renders the basic reader and retires the host's v3 and v2
rules through /report; a failed report is shown explicitly. No report generates
a replacement.

## What leaves the browser and what stays local

The browser sends host lookup metadata and, for local disclosure/consented
generation, the sanitized BODY, page URL and tab identifier to 127.0.0.1.
Scripts, active embeds, handlers, unsafe destinations and form values are stripped
using procedure-v3 cleaning semantics. Source HTML is bounded to 1 MiB UTF-8;
the request envelope is bounded to 2 MiB to accommodate JSON escaping. Larger or
unavailable contexts retain the basic view.

Only the agent's de-identified outlines, queries, previews and bounded action
history, together with system instructions and model settings, reach the provider.
Cues default to 60 characters after the agent's redaction of emails, phone
numbers, URL paths, long digit runs and handles. Names and free-text personal
details can remain: redaction is not anonymization or a privacy guarantee.

The default runtime provider is DeepSeek Flash with thinking disabled; its key
comes from DEEPSEEK_API_KEY or ~/.env.shared and is never packaged in the
extension. There is no provider fallback. npm run start:codex explicitly selects
the Codex runtime runner with existing CLI sign-in and consumes Codex allowance;
it requires the applicable authorization. No production Firebase is used by the
default local configuration.

Consented examples stay under workspace/local-ai/runtime-examples/. Runtime
payloads, pending/admitted family records, archives and usage stay under
workspace/local-ai/ (provider/model subdirectories). The runtime policy does not
modify the development/evaluation corpus or study ledger. LOCAL_AI_MAX_CALLS
defaults to 20 and can be lowered to 1-20. Every guarded agent turn reserves one
session attempt while awaiting its click; cancellation/expiry can therefore
consume an attempt without a provider call. Only one turn is active at once.
Restarting resets the session allowance; local examples and admitted rules persist.
An interrupted two-page induction is marked failed on restart and requires clearing
pending examples or reporting before a new attempt; it never resumes a provider
request automatically.

Options has "Clear pending examples". It removes pending and failed examples
from active registration and cancels outstanding consent jobs. Under the project's
retention rule originals are moved into a local archive, not erased from disk.
Admitted rules and their evidence remain. Reporting also archives rule records.
This is not a data-erasure control.

## Offline checks

No paid or local model is needed:

```text
node --test tests/revision/extension/routes.test.cjs
node --test tests/revision/extension/content.test.cjs
node --test tests/revision/extension/browser.test.cjs
```

The browser test uses installed Chrome and playwright-core with a fresh isolated
profile, real unpacked extension, worker and content scripts, and a local fixture
site. It renders the production panel in an extension tab rather than automating
Chrome's native sidebar shell. Only the backend loopback port differs in the
isolated extension copy. LOCAL_AI_FAKE_RUNNER=1 selects the scripted runner;
it never falls through to a provider. Test artifacts stay under
workspace/local-ai/wp-d1-*/. Fake outputs check control flow, not model quality
or accessibility conformance.

The study tools and tests/local historical captures remain separate. Do not run
archived acceptance scripts or live study generation as installation checks.
