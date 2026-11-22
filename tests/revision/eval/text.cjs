'use strict';
const { createDOM } = require('./dom.cjs');
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
// Semantic HTML block boundaries, independent of CSS/layout or a live browser.
const BLOCK_TAGS = new Set(('ADDRESS ARTICLE ASIDE BLOCKQUOTE BODY CAPTION CENTER DD DETAILS DIALOG DIR DIV DL DT FIELDSET FIGCAPTION FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HGROUP HR LEGEND LI MAIN MENU NAV OL P PRE SEARCH SECTION SUMMARY TABLE TBODY TD TFOOT TH THEAD TR UL').split(' '));
const EXCLUDED_TAGS = new Set(['HEAD', 'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
function nodeText(node) {
  if (node?.nodeType === 9) node = node.body || node.documentElement;
  if (!node || ![1, 3, 9, 11].includes(node.nodeType)) throw Error('text-extraction-requires-html-or-dom-node');
  const parts = [], stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (current === ' ') { parts.push(' '); continue; }
    if (current.nodeType === 3) { parts.push(current.nodeValue); continue; }
    if (![1, 9, 11].includes(current.nodeType)) continue;
    const tag = current.tagName?.toUpperCase();
    if (EXCLUDED_TAGS.has(tag)) continue;
    const boundary = BLOCK_TAGS.has(tag) || tag === 'BR';
    if (boundary) { parts.push(' '); stack.push(' '); }
    for (let i = current.childNodes.length - 1; i >= 0; i--) stack.push(current.childNodes[i]);
  }
  return normalize(parts.join(''));
}
// Accept HTML strings OR existing Document/Element/DocumentFragment nodes.
// DOM inputs are read-only, so annotators can extract each unit identically.
function extractText(input) {
  if (typeof input !== 'string') return nodeText(input);
  const dom = createDOM(input);
  try { return nodeText(dom.window.document); }
  finally { dom.window.close(); }
}
module.exports = { normalize, extractText, nodeText };
