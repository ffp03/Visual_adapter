'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lcsAlignment, qualifyingAlignment, LIMITS } = require('./lcs.cjs');
test('dense checkpoint DP and bounded sparse LCS give identical alignments', () => {
  let state = 1234;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % 3; };
  for (let r = 0; r < 2000; r++) {
    const a = Array.from({ length: 8 }, random), b = Array.from({ length: 8 }, random);
    assert.deepEqual(lcsAlignment(a, b, { backend: 'dense' }), lcsAlignment(a, b));
    for (const required of [1, 4, 7]) assert.deepEqual(qualifyingAlignment(a, b, required, { backend: 'dense' }), qualifyingAlignment(a, b, required));
  }
});
test('qualifying alignment chooses the earliest feasible output start, not the largest later match', () => {
  const a = 'A B C D E F G H I J'.split(' '), b = 'B C D E F G H I J Body A B C D E F G H I J'.split(' ');
  for (const options of [{}, { backend: 'dense' }]) {
    const result = qualifyingAlignment(a, b, 9, options);
    assert.equal(result[0].output, 0); assert.equal(result.length, 9);
    assert.equal(lcsAlignment(a, b, options).length, 10);
  }
});
test('review 3: 10000-token near-complete units finish under a fixed heap and time bound', { timeout: 30000 }, t => {
  const script = `
    const {matchUnit}=require(${JSON.stringify(path.join(__dirname, 'score.cjs'))});
    const {lcsAlignment,qualifyingAlignment}=require(${JSON.stringify(path.join(__dirname, 'lcs.cjs'))});
    const started=Date.now();
    const r=matchUnit('x '.repeat(10000)+'z','x '.repeat(10000));
    if(!r.present||r.alignment.length!==10000)throw Error('wrong concrete long-unit result');
    const a=Array(10000).fill('x').concat('y');
    const b=Array(9999).fill('x').concat('y','x');
    const alignment=lcsAlignment(a,b);
    if(alignment.length!==10000||alignment.at(-1).output!==9999)throw Error('wrong dense long-unit result');
    const q=qualifyingAlignment(a,b,9001,{backend:'dense'});
    if(q[0].output!==0||q.length!==10000)throw Error('wrong dense qualifying result');
    console.log(JSON.stringify({present:r.present,matches:r.alignment.length,denseMatches:alignment.length,elapsedMs:Date.now()-started,rss:process.memoryUsage().rss}));
  `;
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', script], { encoding: 'utf8', timeout: 25000, windowsHide: true });
  assert.equal(child.error, undefined, child.error?.message); assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout); assert.equal(result.matches, 10000); assert.equal(result.denseMatches, 10000);
  assert.ok(result.elapsedMs < 25000); assert.ok(result.rss < 384 * 1024 * 1024, JSON.stringify(result));
  t.diagnostic(JSON.stringify({ heapLimitMiB: 128, ...result }));
});
test('pathological dense work is rejected explicitly before allocating an unbounded workspace', () => {
  assert.throws(() => lcsAlignment(Array(15000).fill('x'), Array(15000).fill('y'), { backend: 'dense' }), /lcs-resource-limit/);
  assert.equal(LIMITS.workspaceBytes, 32 * 1024 * 1024);
});
