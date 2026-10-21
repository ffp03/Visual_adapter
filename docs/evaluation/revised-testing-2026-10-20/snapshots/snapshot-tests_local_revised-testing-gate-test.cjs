const assert = require('node:assert/strict');
const { test } = require('node:test');
const { paperGate } = require('./revised-testing-gate.cjs');
const pages = Array.from({ length: 44 }, (_, i) => ({ id: 'page-' + i, site: Math.floor(i / 2), position: i % 2 + 1 }));
function fixture(passing = 44, fallback = false) {
    return ['fallback', 'compiled-fresh', 'compiled-shared'].flatMap(approach => pages.map((page, i) => {
        const complete = approach !== 'compiled-shared' || i < passing;
        const usedRule = approach !== 'fallback' && !fallback;
        return { ...page, approach, score: { targets: [{ retained: complete }, { retained: true }, { retained: true }], total: 3,
            retained: complete ? 3 : 2, noise: [], links: [], images: [], relativeUrls: 0, complete, usedRule, noFallbackPass: complete && usedRule },
            delivery: { usedRule, ruleApplied: usedRule, noFallback: usedRule, procedureDelivered: usedRule, runtimeSupplementation: false, delivery: usedRule ? 'validated-procedure' : 'fallback' } };
    }));
}
test('strict threshold rejects35/44 and permits36/44 shared rule passes', () => {
    assert.equal(paperGate(fixture(35), pages).paperUpdateAllowed, false);
    const gate = paperGate(fixture(36), pages);
    assert.equal(gate.paperUpdateAllowed, true); assert.equal(gate.passedPages, 36);
    assert.equal(gate.metrics['compiled-shared'].noFallbackSites, 18);
});
test('complete fallback and strong fresh results do not meet the shared no-fallback gate', () => {
    assert.equal(paperGate(fixture(44, true), pages).paperUpdateAllowed, false);
    assert.equal(paperGate(fixture(1), pages).paperUpdateAllowed, false);
});
test('partial studies retain44 denominator and cannot authorize paper updates', () => {
    const gate = paperGate(fixture().filter(row => row.id !== 'page-43'), pages);
    assert.equal(gate.experimentComplete, false); assert.equal(gate.paperUpdateAllowed, false);
    assert.equal(gate.metrics['compiled-shared'].pageDenominator, 44);
});
test('duplicates, wrong site pairing and falsely retained noise are rejected', () => {
    const data = fixture(); assert.throws(() => paperGate([...data, data[0]], pages), /Duplicate/);
    assert.throws(() => paperGate([{ ...data[0], site: 100 }, ...data.slice(1)], pages), /identity/);
    const altered = fixture(); altered[0].score.noise = [{ retained: true }];
    assert.throws(() => paperGate(altered, pages), /Completeness/);
});
test('runtime supplementation and fallback labels cannot inflate no-fallback success', () => {
    const data = fixture(); data.filter(row => row.approach === 'compiled-shared').forEach(row => { row.delivery.runtimeSupplementation = true; });
    assert.equal(paperGate(data, pages).paperUpdateAllowed, false);
    data[0].delivery.ruleApplied = true; assert.throws(() => paperGate(data, pages), /provenance/);
});

test('explicit measurement errors remain in44 denominators and block paper eligibility', () => {
    const data = fixture();
    const error = data.find(row => row.approach === 'compiled-shared' && row.id === 'page-43');
    error.measurementError = 'Synthetic navigation failure';
    error.score = { complete: false, usedRule: false, noFallbackPass: false, targets: [], links: [], images: [], noise: [], relativeUrls: null };
    error.delivery = { usedRule: false, ruleApplied: false, noFallback: false, procedureDelivered: false };
    const gate = paperGate(data, pages);
    assert.equal(gate.passedPages, 43); assert.equal(gate.pageDenominator, 44);
    assert.equal(gate.metrics['compiled-shared'].measurementErrors, 1);
    assert.equal(gate.metrics['compiled-shared'].recordedPages, 44);
    assert.equal(gate.metrics['compiled-shared'].measuredPages, 43);
    assert.equal(gate.experimentComplete, false); assert.equal(gate.paperUpdateAllowed, false);
    error.score.complete = true;
    assert.throws(() => paperGate(data, pages), /Measurement error/);
});

test('legacy rule delivery cannot be mislabeled as compiled-procedure success', () => {
    const data = fixture();
    data.filter(row => row.approach === 'compiled-shared').forEach(row => { row.delivery.procedureDelivered = false; row.delivery.delivery = 'legacy-rule'; });
    assert.equal(paperGate(data, pages).paperUpdateAllowed, false);
});
