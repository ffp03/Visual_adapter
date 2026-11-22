'use strict';
// Enabled only by LOCAL_AI_FAKE_RUNNER=1; never falls through to a provider.
class LayoutFakeRunner {
    constructor({ actions, fail = false } = {}) { this.provider = 'scripted'; this.model = 'layout-fixture'; this.actions = actions; this.fail = fail; this.calls = []; }
    payload(messages) { return { model: this.model, messages, max_tokens: 4096 }; }
    async generate(messages, context) {
        this.calls.push(context.payload);
        if (this.fail) throw Error('Scripted provider failure');
        if (this.actions?.length) return { content: JSON.stringify(this.actions.shift()) };
        const first = JSON.parse(messages[1].content);
        return { content: JSON.stringify({ action: 'submit', rule: { schemaVersion: 3, name: 'Fixture article',
            applicability: { hostname: first.hostname, anchors: [{ selector: 'main.reading', min: 1, max: 1 }] },
            regions: [{ role: 'body', selector: 'main.reading', required: true, multiple: false }], exclude: [], reveal: [],
            provenance: { model: this.model, inductionPages: 2, createdAt: '2026-11-21T00:00:00Z' } } }), usage: { prompt_tokens: 100, completion_tokens: 30 } };
    }
    close() {}
}
module.exports = { LayoutFakeRunner };
