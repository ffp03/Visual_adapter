# Visual Adapter project instructions

- This repository owns extension/backend development, browser tests, corpus
  capture, experiment supervisors and raw evaluation evidence. Keep all related
  task folders inside this project, normally under ignored workspace/.
- Use docs/WORKSPACE_GUIDE.md as the folder index and tests/local/README.md for
  test routes. The paper project owns manuscript/rendering files and receives
  selected sanitized result exports.
- Preserve frozen captures, receipts and checkpoint hashes. Archive superseded
  files; record moves with old/new paths and hashes. Do not rewrite historical
  evidence or run archived acceptance scripts as current tests.
- The loadable extension is extension/. Default local routing is configured in
  extension/backend-config.js. Read docs/LOCAL_AI.md before changing it.
- Offline checks use fixtures/provider doubles. Paid provider calls and live
  collection need their applicable explicit authorization; having a key is not
  permission. Keep study generation separate from installation checks.
- Follow global Git, review, secrets and service-use requirements. Preserve
  unrelated local changes and use this project's existing branch.
