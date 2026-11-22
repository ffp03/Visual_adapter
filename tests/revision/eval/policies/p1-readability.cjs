'use strict';
const { Readability } = require('@mozilla/readability');
const { documentFor, result, failed } = require('./common.cjs');
const { withCssCompatibility } = require('../dom.cjs');
const version = require('@mozilla/readability/package.json').version;
const normalized = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const escaped = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formatArticle(article, document) {
  const content = article.content || '', root = document.createElement('div'); root.innerHTML = content;
  const heading = root.querySelector('h1,h2,h3,h4,h5,h6'), title = normalized(article.title);
  const addTitle = title && (!heading || normalized(heading.textContent) !== title);
  return (addTitle ? '<h1>' + escaped(article.title) + '</h1>' : '')
    + (normalized(article.byline) ? '<p>' + escaped(article.byline) + '</p>' : '') + content;
}
function run(page, baseURL) {
  return withCssCompatibility(skipped => {
  let dom;
  try {
    if (version !== '0.6.0') throw Error('readability-version-mismatch:' + version);
    dom = documentFor(page, baseURL);
    const article = new Readability(dom.window.document.cloneNode(true)).parse();
    return article ? result(formatArticle(article, dom.window.document), true, null, { readabilityVersion: version, title: article.title, byline: article.byline, cssCompatibilitySkipped: skipped() }) : result('', false, 'readability-no-article');
  } catch (error) { return failed(error); }
  finally { dom?.window.close(); }
  });
}
module.exports = { run, formatArticle };
