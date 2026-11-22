'use strict';
// Authorization lasts for exactly one guarded transport invocation. Both study
// and interactive guards use it; providers never decide which budget applies.
const authorized = new WeakSet();
async function dispatch(runner, messages, payload, metadata) {
    const context = { payload, metadata };
    authorized.add(context);
    try { return await runner.generate(messages, context); }
    finally { authorized.delete(context); }
}
module.exports = { dispatch, isAuthorized: context => authorized.has(context) };
