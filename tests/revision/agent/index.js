// Node 22 treats an explicit directory as a module entry, rather than walking
// it. Keep the documented `node --test tests/revision/agent` command portable.
require('./procedure.test.cjs');
require('./outline.test.cjs');
require('./ledger.test.cjs');
require('./loop.test.cjs');
require('./runners.test.cjs');
require('./capability.test.cjs');
require('./review-regressions.test.cjs');
require('./runtime.test.cjs');
require('./catalog.test.cjs');
require('./performance.test.cjs');
require('./evaluation.test.cjs');
require('./regate.test.cjs');
