'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p0 = require('./policies/p0-reader.cjs'), p1 = require('./policies/p1-readability.cjs');
const { replay, run, compile } = require('./policies/p2-replay.cjs');
const html = '<h1>Reading title</h1><main><p id="body">' + 'This is substantive reading text with some meaningful detail. '.repeat(15) + '</p><p class="remove">Essential reading excluded by the model.</p><a href="child" onclick="alert(1)">child</a><a href="javascript:alert(1)">unsafe</a><input value="secret"><script>bad()</script></main><footer>Footer text</footer>';
const candidate = { name: 'fixture', main: 'main', exclude: ['.remove', '.absent'] };
test('P0 uses capture URL and production sanitization', () => {
  const r = p0.run(html, 'https://example.org/base/');
  assert.equal(r.ok, true); assert.match(r.html, /https:\/\/example.org\/base\/child/);
  assert.doesNotMatch(r.html, /onclick|javascript:|secret|<script/); assert.match(r.text, /Reading title/);
});
test('CSS-variable border parser regression preserves markup, other declarations and prototype state', () => {
  const { createDOM, withCssCompatibility } = require('./dom.cjs');
  const { CSSStyleDeclaration } = require('cssstyle');
  const original = CSSStyleDeclaration.prototype.setProperty;
  const source = '<style>.x{border:1px solid var(--border-color-progressive,#36c);border-width:0;display:none;color:red}</style><main class="x"><h1>Title</h1><p>Article content.</p></main>';
  // createDOM strips <style> (DESIGN 7b); the compatibility wrapper is tested on a raw JSDOM.
  const { JSDOM } = require('jsdom');
  const dom = withCssCompatibility(() => new JSDOM(source));
  assert.equal(createDOM(source).window.document.querySelector('style'), null);
  assert.equal(dom.window.document.querySelector('style').textContent, '.x{border:1px solid var(--border-color-progressive,#36c);border-width:0;display:none;color:red}');
  const rule = dom.window.document.styleSheets[0].cssRules[0];
  assert.equal(rule.style.display, 'none'); assert.equal(rule.style.color, 'red');
  assert.equal(CSSStyleDeclaration.prototype.setProperty, original);
  withCssCompatibility(() => assert.ok(dom.window.document.cloneNode(true)));
  assert.throws(() => withCssCompatibility(() => { throw Error('sentinel'); }), /sentinel/);
  assert.equal(CSSStyleDeclaration.prototype.setProperty, original);
  dom.window.close();
  assert.equal(p0.run(source).ok, true);
  assert.equal(p1.run(source).ok, true);
});
test('Readability 0.6.0 parses a clone and returns a counted null-article failure', () => {
  const r = p1.run(html, 'https://example.org/');
  assert.equal(r.ok, true); assert.equal(r.readabilityVersion, '0.6.0'); assert.match(r.text, /substantive reading/);
  assert.equal(p1.run('<html><body></body></html>').ok, false);
});
test('P2 supplements title and drops unsafe exclusions; P2-nr keeps exact model selection', () => {
  const both = replay({ html, url: 'https://example.org/base/' }, candidate);
  assert.equal(both.P2.ok, true, both.P2.reason); assert.match(both.P2.text, /Reading title/);
  assert.match(both.P2.text, /Essential reading/);
  assert.equal(both['P2-nr'].ok, true, both['P2-nr'].reason);
  assert.doesNotMatch(both['P2-nr'].text, /Reading title|Essential reading/);
  assert.match(both['P2-nr'].html, /https:\/\/example.org\/base\/child/);
  assert.doesNotMatch(both['P2-nr'].html, /onclick|javascript:|secret|<script/);
});
test('P2-nr retains safety checks and failure reasons without fallback', () => {
  for (const [c, expected] of [
    ['{broken', /JSON|property|Expected/],
    [{ ...candidate, main: '[' }, /invalid-selector/],
    [{ ...candidate, main: 'p' }, /exactly-once/],
    [{ ...candidate, main: '#missing' }, /exactly-once/],
    [{ ...candidate, main: 'p:first-child' }, /unstable/],
    [{ ...candidate, exclude: ['p:nth-child(1)'] }, /unstable/],
    [{ ...candidate, exclude: ['['] }, /invalid-selector/],
    [{ main: 'main' }, /invalid-model-rule/]
  ]) {
    const r = run(html, c, { noRepair: true }); assert.equal(r.ok, false); assert.equal(r.html, ''); assert.equal(r.fallback, false); assert.match(r.reason, expected);
  }
  const removedRoot = run(html, { ...candidate, exclude: ['main'] }, { noRepair: true });
  assert.equal(removedRoot.ok, true); assert.equal(removedRoot.text, '');
});
test('shared P2 applies the seed procedure unchanged instead of repairing on the target', () => {
  const seed = '<h1 id="title">Shared title</h1><main><p>' + 'Seed article prose with substantive details. '.repeat(10) + '</p></main>';
  const target = seed + '<aside id="added"><p>New reading material outside the model main.</p></aside>';
  const rule = { main: 'main', exclude: [], name: 'shared' };
  const compiled = compile(seed, rule); assert.equal(compiled.ok, true, compiled.reason);
  const original = JSON.stringify(compiled.procedure);
  assert.equal(run(target, rule).ok, true);
  const shared = run(target, rule, { procedure: compiled.procedure });
  assert.equal(shared.ok, false); assert.match(shared.reason, /scope|preservation/);
  assert.equal(JSON.stringify(compiled.procedure), original);
  assert.equal(run(target, rule, { inductionPage: seed }).ok, false);
  assert.equal(run(target, rule, { noRepair: true }).ok, true);
});
test('createDOM removes style elements (also in templates) and keeps markup and inline styles', () => {
  const { createDOM } = require('./dom.cjs');
  const d = createDOM('<head><style>p{color:red}</style></head><main><h1 style="display:none">T</h1><template><style>x{}</style><p>t</p></template><p>Body</p></main>').window.document;
  assert.equal(d.querySelectorAll('style').length, 0);
  assert.equal(d.querySelector('template').content.querySelectorAll('style').length, 0);
  assert.equal(d.querySelector('h1').getAttribute('style'), 'display:none');
  assert.equal(d.querySelector('main > p').textContent, 'Body');
});
