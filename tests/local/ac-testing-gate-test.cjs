const assert = require('node:assert/strict');
const { test } = require('node:test');
const { paperGate } = require('./ac-testing-gate.cjs');
const pages = Array.from({ length: 44 }, (_, i) => ({ id: 'page-' + i, site: Math.floor(i / 2), position: i % 2 + 1 }));
function fixture(passing = 44, fallback = false) {
    return ['fallback', 'compiled-fresh', 'compiled-shared'].flatMap(approach => pages.map((page, i) => {
        const complete = approach !== 'compiled-shared' || i < passing;
        const usedRule = approach !== 'fallback' && !fallback;
        return { ...page, approach, measurementComplete:true, score: { targets: [{ retained: complete }, { retained: true }, { retained: true }], total: 3,
            retained: complete ? 3 : 2, noise: [], links: [], images: [], relativeUrls: 0, complete, usedRule, noFallbackPass: complete && usedRule },
            delivery: { usedRule, ruleApplied: usedRule, noFallback: usedRule, procedureDelivered: usedRule, runtimeSupplementation: false, delivery: usedRule ? 'validated-procedure' : 'fallback' } };
    }));
}
const numbers=n=>Array.from({length:n},(_,i)=>i);
const baselineNF=[...numbers(28),28,30,32,34];
function paretoFixture(nf=baselineNF,reading=numbers(40)){
    const n=new Set(nf),r=new Set(reading);
    return fixture().map(row=>{if(row.approach!=='compiled-shared')return row;const i=Number(row.id.slice(5)),complete=r.has(i),used=n.has(i);return{...row,score:{...row.score,targets:[{retained:complete},{retained:true},{retained:true}],retained:complete?3:2,complete,usedRule:used,noFallbackPass:complete&&used},delivery:{...row.delivery,usedRule:used,ruleApplied:used,noFallback:used,procedureDelivered:used,delivery:used?'validated-procedure':'fallback'}};});
}
test('fixed32page14pair baseline is not improvement; page or pair Pareto improvement qualifies',()=>{
    const equal=paperGate(paretoFixture(),pages);assert.equal(equal.passedPages,32);assert.equal(equal.passedSites,14);assert.equal(equal.paperUpdateAllowed,false);
    const page=paperGate(paretoFixture([...baselineNF,36]),pages);assert.equal(page.passedPages,33);assert.equal(page.passedSites,14);assert.equal(page.paperUpdateAllowed,true);
    const pairs=paperGate(paretoFixture([...numbers(30),30,32]),pages);assert.equal(pairs.passedPages,32);assert.equal(pairs.passedSites,15);assert.equal(pairs.paperUpdateAllowed,true);
});
test('improving one NF endpoint cannot compensate for regression in the other',()=>{
    const pagesDown=paperGate(paretoFixture([...numbers(30),30]),pages);assert.equal(pagesDown.passedPages,31);assert.equal(pagesDown.passedSites,15);assert.equal(pagesDown.paperUpdateAllowed,false);
    const pairsDown=paperGate(paretoFixture([...numbers(26),26,28,30,32,34,36,38]),pages);assert.equal(pairsDown.passedPages,33);assert.equal(pairsDown.passedSites,13);assert.equal(pairsDown.paperUpdateAllowed,false);
});
test('shared reading cannot regress below40pages or20pairs; fresh/fallback gains are insufficient',()=>{
    assert.equal(paperGate(paretoFixture([...baselineNF,36],numbers(39)),pages).paperUpdateAllowed,false);
    const pairsDown=paperGate(paretoFixture([...baselineNF,36],[...numbers(38),40,42]),pages);assert.equal(pairsDown.metrics['compiled-shared'].completePages,40);assert.equal(pairsDown.metrics['compiled-shared'].completeSites,19);assert.equal(pairsDown.paperUpdateAllowed,false);
    assert.equal(paperGate(paretoFixture(),pages).paperUpdateAllowed,false);
});
test('genuine completion flags are required for all132 policy observations',()=>{
    const data=fixture();data[0].measurementComplete=false;assert.equal(paperGate(data,pages).experimentComplete,false);assert.equal(paperGate(data,pages).paperUpdateAllowed,false);
    delete data[0].measurementComplete;assert.equal(paperGate(data,pages).paperUpdateAllowed,false);
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
