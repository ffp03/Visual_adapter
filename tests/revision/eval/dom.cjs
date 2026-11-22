'use strict';
const { JSDOM } = require('jsdom');
const { CSSStyleDeclaration } = require('cssstyle');
const parse5 = require('parse5');

// cssstyle 5.3.3 throws while combining a CSS-variable border shorthand with
// later longhands. Its failure is decorative CSSOM parsing, not invalid HTML.
// Scope the workaround to synchronous harness operations; preserve the source
// markup and every non-border property. No package or production code is edited.
function withCssCompatibility(operation) {
  const original = CSSStyleDeclaration.prototype.setProperty;
  let skipped = 0;
  CSSStyleDeclaration.prototype.setProperty = function(name, value, priority) {
    try { return original.call(this, name, value, priority); }
    catch (error) {
      if (/^border(?:-|$)/i.test(name) && error instanceof TypeError && /Cannot create property 'border-(?:width|style|color)' on string/.test(error.message)) {
        skipped++;
        return;
      }
      throw error;
    }
  };
  try { return operation(() => skipped); }
  finally { CSSStyleDeclaration.prototype.setProperty = original; }
}
// DESIGN 7b (2026-11-21): <style> elements are removed before parsing, as the agent's page
// loader (backend/agent/pages.cjs) already does. No harness code reads CSS, and jsdom's CSSOM
// hangs on some captured stylesheets (eval-23). Checked neutral on all 60 development pages
// (P0, P1 output and extracted-text hashes identical).
function stripStyles(html) {
  const tree = parse5.parse(html);
  const strip = node => {
    if (node.childNodes) { node.childNodes = node.childNodes.filter(child => child.tagName !== 'style'); node.childNodes.forEach(strip); }
    if (node.content) strip(node.content);
  };
  strip(tree);
  return parse5.serialize(tree);
}
function createDOM(html, options) { return withCssCompatibility(() => new JSDOM(typeof html === 'string' ? stripStyles(html) : html, options)); }
module.exports = { createDOM, withCssCompatibility, stripStyles };
