'use strict';
const { createDOM } = require('../dom.cjs');
const { htmlText } = require('../score.cjs');
function documentFor(page, baseURL) {
  return createDOM(typeof page === 'string' ? page : page.html, { url: baseURL || page.url || 'https://capture.invalid/' });
}
function result(html, ok = true, reason = null, extra = {}) { return { html, text: htmlText(html), ok, reason, fallback: false, modelRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, costEstimate: 0, ...extra }; }
function failed(error) { return result('', false, error.message || String(error)); }
module.exports = { documentFor, result, failed };
