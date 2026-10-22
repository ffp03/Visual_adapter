# Visual Adapter

Chrome extension for a configurable reading view, with AI-generated adaptation
procedures, checked reuse and a basic local fallback.

## Use the current extension

1. From this project folder, run `npm run start:local` (Node.js 22.13 or newer).
   The local backend uses DeepSeek through the existing shared-secret key.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and select this project's `extension` folder. If already installed from that
   folder, press its **Reload** button and refresh the website tab.
3. Click **Visual Adapter for Low Vision** in Chrome's extensions menu to open
   the reading panel. Set the text size, font and colours in the panel.

The backend must remain running. Its status is at
http://127.0.0.1:7861/health. A date-labelled ZIP and exact file hashes are kept
in `workspace/releases/`; the unpacked `extension` folder is the current source.
No build step is required for that folder. The local backend is a separate
process and is not included in the extension-only ZIP.

Current runtime changes include balanced DOM evidence within 12,000 characters,
deterministic preservation checks, complete validation contexts with lossless
compression, multi-example procedure admission and local fallback. The runtime
files match the final study's production revision `2d1b5ef`. This identifies the
tested code; individual pages can still require fallback.

## Project layout

| Location | Purpose |
|---|---|
| `extension/` | Loadable Chrome extension |
| `backend/` | Local API, provider adapter and validation |
| `tests/local/` | Maintained regression and study tools |
| `docs/LOCAL_AI.md` | Setup, provider selection and local data handling |
| `docs/WORKSPACE_GUIDE.md` | Experiment folders, provenance and relocated history |
| `docs/evaluation/` | Tracked protocols and sanitized study records |
| `workspace/task023/` | Original captures, request receipts and evaluation evidence |
| `workspace/local-ai/` | Persistent cache and interactive usage ledger |
| `workspace/releases/` | Extension packages and package manifests |

Run `npm run test:local` for offline regressions. It uses fixtures and provider
doubles. Paid generation and live website collection are separate, explicitly
authorized operations; never use a study-generation command as an installation
check. See [testing details](tests/local/README.md).

The default is the local DeepSeek route. The optional Codex route is documented
in [local setup](docs/LOCAL_AI.md). The old hosted Gemini configuration is not
the current tested deployment. No Chrome Web Store release has been published.
