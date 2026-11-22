'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, htmlText, lcsAlignment, matchUnit, score, kendallTau } = require('./score.cjs');
const reference = {
  content: [{ id: 'title', role: 'title', required: true, text: 'Article title' }, { id: 'body', role: 'body', required: true, text: 'one two three four five six seven eight nine ten' }],
  noise: [{ id: 'nav', text: 'Home About Contact' }]
};
test('NFKC, whitespace, case and HTML block/inline text', () => {
  assert.equal(normalize('  Ａ\n b  '), 'A b');
  assert.equal(htmlText('<head><title>Head</title></head><h1>A</h1><p>he<em>llo</em></p><script>Bad</script>'), 'A hello');
  assert.equal(matchUnit('Hello', 'hello').present, false);
});
test('DOM annotation text convention separates adjacent lists/cells; short order uses LCS', () => {
  assert.equal(htmlText('<ul><li>First</li><li>Second</li></ul><table><tr><td>Key</td><td>Value</td></tr></table>'), 'First Second Key Value');
  assert.equal(score('<main><ul><li>First</li><li>Second</li></ul></main>', { content: [{ role: 'title', required: true, text: 'First Second' }], noise: [] }, { format: 'html' }).contentRecall, 1);
  const r = score('Artwork Body Art', { content: [{ role: 'title', required: true, text: 'Art' }, { role: 'body', required: true, text: 'Body' }], noise: [] });
  assert.equal(r.titleFirst, true); assert.equal(r.orderTau, 1);
  assert.equal(matchUnit('cat', 'concatenate').position, 0);
  assert.equal(score('😀 word', { content: [{ role: 'title', required: true, text: 'word' }], noise: [{ text: '😀' }] }).noiseCharacterShare, 1 / 6);
  assert.throws(() => score('missing', reference, { presenceThreshold: 0 }), /invalid-threshold/);
});
test('shared extractor separates block/br boundaries without separating inline text or mutating DOM', () => {
  const { extractText } = require('./score.cjs'), { createDOM } = require('./dom.cjs');
  const dom = createDOM('<head><title>Ignored</title></head><article><h1>Title</h1><p>he<strong>llo</strong><br>world</p><div>A<section>B</section>C</div></article>');
  const before = dom.window.document.documentElement.outerHTML;
  assert.equal(extractText(dom.window.document), 'Title hello world A B C');
  assert.equal(extractText(dom.window.document.querySelector('p')), 'hello world');
  assert.equal(dom.window.document.documentElement.outerHTML, before);
  dom.window.close();
});
test('dev-01-p2 Python title remains present when an adjacent block has no source whitespace', () => {
  const title = 'Python 3.13.0 alpha 3 is now available.';
  const html = `<h1>${title}</h1><p>Following release details appear here.</p>`;
  const reference = { content: [{ role: 'title', required: true, text: title }, { role: 'body', required: true, text: 'Following release details appear here.' }], noise: [] };
  const result = score(html, reference, { format: 'html' });
  assert.equal(result.titlePresent, true); assert.equal(result.titleFirst, true); assert.equal(result.contentRecall, 1); assert.equal(result.cleanPass, true);
  // Old textContent merged the final title token into the first body token:
  assert.equal(matchUnit(title, title + 'Following release details appear here.').present, false);
});
test('monotone consuming order separates identical title and lede occurrences', () => {
  const repeated = 'Identical title and lede content here';
  const ref = { content: [{ id: 't', role: 'title', required: true, text: repeated }, { id: 'l', role: 'lede', required: true, text: repeated }, { id: 'b', role: 'body', required: true, text: 'Following body' }], noise: [] };
  const r = score(repeated + ' ' + repeated + ' Following body', ref);
  assert.equal(r.contentRecall, 1); assert.equal(r.titleFirst, true); assert.equal(r.orderTau, 1); assert.equal(r.cleanPass, true);
  assert.deepEqual(r.content.map(u => u.position), [0, 6, 12]);
  const missing = score(repeated + ' Following body', ref);
  assert.equal(missing.contentRecall, 1); assert.equal(missing.orderUnassignedUnits, 1); assert.equal(missing.cleanPass, false);
  assert.equal(missing.content[1].position, null);
});
test('dev-01-p1 regression: title and identical lede no longer share output position zero', () => {
  const title = 'Python 3.12.2 and 3.11.8 are now available.';
  const html = `<main><h1>${title}</h1>\n<p>${title}</p>\n<p>Following release details.</p></main>`;
  const output = require('./policies/p0-reader.cjs').run(html);
  assert.equal(output.ok, true);
  const ref = { content: [{ id: 'title-1', role: 'title', required: true, text: title }, { id: 'lede-4', role: 'lede', required: true, text: title }, { id: 'body', role: 'body', required: true, text: 'Following release details.' }], noise: [] };
  assert.equal(matchUnit(title, output.text).position, 0);
  const result = score(output.html, ref, { format: 'html' });
  assert.equal(result.contentRecall, 1); assert.equal(result.titleFirst, true); assert.equal(result.orderTau, 1); assert.equal(result.cleanPass, true);
  assert.ok(result.content[1].position > result.content[0].position);
});
test('nested publication link cannot reuse tokens consumed by a differently worded parent unit', () => {
  const title = 'Python 3.12.2 and 3.11.8 are now available.';
  const parent = 'Publication note: Originally published on Blogger';
  const ref = { content: [{ role: 'title', required: true, text: title }, { role: 'lede', required: true, text: title }, { role: 'body', required: true, text: parent }, { role: 'body', required: true, text: 'Originally published on Blogger' }], noise: [] };
  const r = score(title + ' ' + title + ' ' + parent, ref);
  assert.equal(r.contentRecall, 1); assert.equal(r.titleFirst, false); assert.equal(r.orderTau, 0);
  assert.equal(r.orderUnassignedUnits, 1); assert.equal(r.cleanPass, false);
});
test('review 1: different units cannot reuse an omitted paragraph inside an earlier paragraph', () => {
  const first = 'red green blue black white orange purple brown grey gold';
  const second = 'green blue black white orange purple brown grey gold';
  const reference = { content: [{ role: 'title', text: 'Intro', required: true }, { role: 'body', text: first, required: true }, { role: 'body', text: second, required: true }], noise: [] };
  const result = score('Intro ' + first, reference);
  assert.equal(result.contentRecall, 1); assert.equal(result.content[2].position, null); assert.equal(result.orderUnassignedUnits, 1); assert.equal(result.cleanPass, false);
  const indices = result.content.flatMap(u => u.orderAlignment);
  assert.equal(indices.length, new Set(indices).size);
});
test('review 2: earliest qualifying LCS precedes a later exact occurrence', () => {
  const title = 'A B C D E F G H I J';
  const reference = { content: [{ role: 'title', text: title, required: true }, { role: 'body', text: 'Body', required: true }], noise: [] };
  for (const output of ['A B C D E F G H I Body A B C D E F G H I J', 'B C D E F G H I J Body A B C D E F G H I J']) {
    const result = score(output, reference);
    assert.equal(result.content[0].position, 0); assert.equal(result.titleFirst, true); assert.equal(result.orderTau, 1); assert.equal(result.cleanPass, true);
  }
});
test('review 4: malformed required flags are rejected before they can change the denominator', () => {
  const content = [{ role: 'title', text: 'Title', required: true }, { role: 'body', text: 'Body', required: 'true' }];
  assert.throws(() => score('Title', { content, noise: [] }), /invalid-reference-required/);
  for (const required of [undefined, null, 1, 0, 'false']) assert.throws(() => score('Title', { content: [{ ...content[0], required }], noise: [] }), /invalid-reference-required/);
  assert.equal(score('Title', { content: [content[0], { ...content[1], required: false }], noise: [] }).completePass, true);
});
test('consuming order falls back to earlier unused occurrence to expose inversions', () => {
  const ref = { content: [{ role: 'title', required: true, text: 'Title here' }, { role: 'body', required: true, text: 'Second body' }, { role: 'body', required: true, text: 'Third body' }], noise: [] };
  const r = score('Title here Third body Second body', ref);
  assert.deepEqual(r.content.map(u => u.position), [0, 4, 2]); assert.equal(r.orderTau, 1 / 3); assert.equal(r.cleanPass, false);
});
test('partial LCS occurrences consume matched tokens and keep independent presence', () => {
  const text = 'one two three four five six seven eight nine ten';
  const ref = { content: [{ role: 'title', required: true, text: 'Title' }, { role: 'body', required: true, text }, { role: 'body', required: true, text }], noise: [] };
  const r = score('Title one two three four five six seven eight nine one two three four five six seven eight nine', ref);
  assert.equal(r.contentRecall, 1); assert.equal(r.orderUnassignedUnits, 0); assert.equal(r.orderTau, 1);
  assert.ok(r.content[2].position > r.content[1].position);
});
test('short units use exact substring; five-token units use inclusive LCS threshold', () => {
  assert.equal(matchUnit('one two', 'one extra two').present, false);
  assert.equal(matchUnit('cat', 'concatenate').present, true);
  assert.equal(matchUnit('one two three four five six seven eight nine ten', 'one two three four five six seven eight nine').present, true);
  assert.equal(matchUnit('one two three four five six seven eight nine ten', 'one two three four five six seven eight').present, false);
  assert.equal(matchUnit('one two three four five', 'one two three four', { presenceThreshold: 0.8 }).present, true);
  assert.equal(matchUnit('one two', 'one X two', { exactBelowTokens: 2 }).present, true);
});
test('content, weighted recall, partial noise and overlapping spans', () => {
  const r = score('Article title one two three four five six seven eight nine ten Home', reference);
  assert.equal(r.contentRecall, 1); assert.equal(r.contentCharacterRecall, 1);
  assert.equal(r.completePass, true); assert.equal(r.cleanPass, true); assert.equal(r.titleFirst, true);
  assert.equal(r.noiseLeakage, 0); assert.equal(r.noiseCharacterShare, 4 / r.outputCharacters);
  const overlap = score('Article title Home About', { ...reference, noise: [{ text: 'Home About' }, { text: 'Home About' }] });
  assert.equal(overlap.noiseCharacterShare, 9 / overlap.outputCharacters);
  assert.equal(overlap.noiseLeakage, 1);
  const missing = score('Article title', reference);
  assert.equal(missing.contentRecall, 0.5); assert.equal(missing.contentCharacterRecall, 13 / (13 + reference.content[1].text.length));
  assert.equal(missing.titleFirst, false); assert.equal(missing.completePass, false);
});
test('title, reversed order, ties, failures and missing title', () => {
  const r = score(reference.content[1].text + ' Article title', reference);
  assert.equal(r.titleFirst, false); assert.equal(r.orderTau, -1); assert.equal(r.completePass, true); assert.equal(r.cleanPass, false);
  assert.equal(kendallTau([0]), 1); assert.equal(kendallTau([0, 0]), 0);
  assert.equal(kendallTau([0, 1, 1]), 2 / Math.sqrt(6));
  assert.equal(score('', reference, { ok: false }).noFallbackPass, false);
  const good = reference.content.map(u => u.text).join(' ');
  assert.equal(score(good, reference, { fallback: true }).noFallbackPass, false);
  assert.equal(score(good, { ...reference, content: reference.content.slice(1) }).completePass, false);
  assert.throws(() => score('', { content: [], noise: [] }), /no-required/);
});
test('declared complete and clean thresholds are inclusive and parameterized', () => {
  const content = Array.from({ length: 20 }, (_, i) => ({ id: String(i), role: i === 0 ? 'title' : 'body', required: true, text: 'UniqueToken' + i + '.' }));
  const noise = Array.from({ length: 5 }, (_, i) => ({ id: 'n' + i, text: 'NoiseToken' + i + '.' }));
  const output = content.slice(0, 19).map(u => u.text).join(' ') + ' NoiseToken0.';
  const r = score(output, { content, noise });
  assert.equal(r.contentRecall, 0.95); assert.equal(r.noiseLeakage, 0.2); assert.equal(r.completePass, true); assert.equal(r.cleanPass, true);
  assert.equal(score(output, { content, noise }, { completeThreshold: 0.96 }).completePass, false);
  assert.equal(score(output, { content, noise }, { noiseThreshold: 0.19 }).cleanPass, false);
  const reversed = score('Article title ' + reference.content[1].text, reference, { orderThreshold: 1 });
  assert.equal(reversed.cleanPass, true);
});
test('sparse LCS matches exhaustive earliest-alignment oracle with repeated tokens', () => {
  function oracle(a, b, i = 0, j = 0) {
    if (i === a.length || j === b.length) return [];
    const choices = [oracle(a, b, i + 1, j), oracle(a, b, i, j + 1)];
    if (a[i] === b[j]) choices.push([{ unit: i, output: j }, ...oracle(a, b, i + 1, j + 1)]);
    choices.sort((x, y) => {
      if (x.length !== y.length) return y.length - x.length;
      for (let k = 0; k < x.length; k++) if (x[k].output !== y[k].output) return x[k].output - y[k].output;
      for (let k = 0; k < x.length; k++) if (x[k].unit !== y[k].unit) return x[k].unit - y[k].unit;
      return 0;
    });
    return choices[0];
  }
  for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
    const a = [...x.toString(2).padStart(5, '0')], b = [...y.toString(2).padStart(5, '0')];
    const expected = oracle(a, b);
    assert.deepEqual(lcsAlignment(a, b), expected, `${a}/${b}`);
    assert.deepEqual(require('./lcs.cjs').lcsAlignment(a, b, { backend: 'dense' }), expected, `dense:${a}/${b}`);
  }
});
