'use strict';
const fs = require('node:fs');
const { normalize, extractText } = require('./text.cjs');
const { lcsAlignment, qualifyingAlignment } = require('./lcs.cjs');
const SCORING_VERSION = '2026-11-21-global-consumption-earliest-qualifying';
const DEFAULTS = Object.freeze({ presenceThreshold: 0.9, exactBelowTokens: 5, completeThreshold: 0.95, noiseThreshold: 0.2, orderThreshold: 0.9 });
const characterLength = value => [...value].length;
const htmlText = extractText;
const tokenize = text => [...text.matchAll(/\S+/gu)].map(m => ({ value: m[0], start: m.index, end: m.index + m[0].length }));
function matchUnit(text, outputText, options = {}, outputTokens = tokenize(normalize(outputText))) {
  const opts = { ...DEFAULTS, ...options }, unitText = normalize(text), tokens = tokenize(unitText);
  if (!(opts.presenceThreshold > 0 && opts.presenceThreshold <= 1)) throw Error('invalid-threshold:presenceThreshold');
  const output = normalize(outputText);
  const alignment = lcsAlignment(tokens.map(t => t.value), outputTokens.map(t => t.value));
  const exactIndex = unitText ? output.indexOf(unitText) : -1;
  const present = tokens.length > 0 && (tokens.length < opts.exactBelowTokens ? exactIndex >= 0 : alignment.length / tokens.length >= opts.presenceThreshold);
  // LCS determines order for short units too. If exact substring presence has
  // no token-level match, anchor at the token containing that substring.
  const position = !present ? null : alignment.length ? alignment[0].output : outputTokens.findIndex(t => t.end > exactIndex);
  return { present, position, tokenRecall: tokens.length ? alignment.length / tokens.length : 0, alignment, characters: characterLength(unitText) };
}
// Order is a separate, consuming assignment; the declared independent LCS
// presence/recall measure and noise alignments do not change.
function alignContent(content, text, tokens, options = {}) {
  const opts = { ...DEFAULTS, ...options }, used = new Set();
  let previous = -1;
  const firstTokenAt = character => {
    let lo = 0, hi = tokens.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (tokens[mid].end <= character) lo = mid + 1; else hi = mid; }
    return lo;
  };
  return content.map(unit => {
    if (!unit.present) return { ...unit, position: null, orderAlignment: [], occurrenceKind: null };
    const normalized = normalize(unit.text), unitTokens = tokenize(normalized);
    const occurrence = after => {
      if (unitTokens.length < opts.exactBelowTokens) {
        for (let start = text.indexOf(normalized); start >= 0; start = text.indexOf(normalized, start + 1)) {
          const end = start + normalized.length, indices = [];
          for (let j = firstTokenAt(start); j < tokens.length && tokens[j].start < end; j++) indices.push(j);
          if (indices.length && indices[0] > after && indices.every(j => !used.has(j))) return { position: indices[0], indices, kind: 'exact', start, end };
        }
        return null;
      } else {
        const indices = tokens.flatMap((_, j) => !used.has(j) && j > after ? [j] : []);
        const alignment = qualifyingAlignment(unitTokens.map(t => t.value), indices.map(j => tokens[j].value), Math.ceil(unitTokens.length * opts.presenceThreshold));
        if (!alignment.length) return null;
        const matched = alignment.map(p => indices[p.output]);
        return { position: matched[0], indices: matched, kind: 'lcs', start: tokens[matched[0]].start, end: tokens[matched.at(-1)].end };
      }
    };
    const chosen = occurrence(previous) || occurrence(-1);
    if (!chosen) return { ...unit, position: null, orderAlignment: [], occurrenceKind: 'unassigned' };
    for (const j of chosen.indices) used.add(j);
    previous = chosen.position;
    return { ...unit, position: chosen.position, orderAlignment: chosen.indices, occurrenceKind: chosen.kind, occurrenceCharacters: [chosen.start, chosen.end] };
  });
}
function kendallTau(positions) {
  if (positions.length < 2) return 1;
  let concordant = 0, discordant = 0, ties = 0;
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    if (positions[i] < positions[j]) concordant++; else if (positions[i] > positions[j]) discordant++; else ties++;
  }
  const comparable = concordant + discordant;
  return comparable ? (concordant - discordant) / Math.sqrt(comparable * (comparable + ties)) : 0;
}
function score(output, reference, options = {}) {
  const opts = Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, options[key] ?? value]));
  for (const key of ['presenceThreshold', 'completeThreshold', 'noiseThreshold']) if (!(opts[key] >= 0 && opts[key] <= 1)) throw Error('invalid-threshold:' + key);
  if (!(opts.orderThreshold >= -1 && opts.orderThreshold <= 1) || !Number.isInteger(opts.exactBelowTokens) || opts.exactBelowTokens < 1) throw Error('invalid-threshold');
  if (!reference || !Array.isArray(reference.content) || !Array.isArray(reference.noise)) throw Error('invalid-reference');
  if (reference.content.some(u => !u || typeof u.required !== 'boolean')) throw Error('invalid-reference-required');
  const units = [...reference.content, ...reference.noise];
  if (units.some(u => typeof u.text !== 'string' || !normalize(u.text))) throw Error('empty-reference-unit');
  const text = options.format === 'html' ? htmlText(output) : normalize(output), tokens = tokenize(text);
  const content = alignContent(reference.content.map(u => ({ id: u.id, role: u.role, text: u.text, required: u.required === true, ...matchUnit(u.text, text, opts, tokens) })), text, tokens, opts).map(({ text: unitText, ...unit }) => unit);
  const noise = reference.noise.map(u => ({ id: u.id, ...matchUnit(u.text, text, opts, tokens) }));
  const required = content.filter(u => u.required), present = required.filter(u => u.present);
  if (!required.length) throw Error('reference-has-no-required-units');
  const contentRecall = present.length / required.length;
  const contentCharacterRecall = present.reduce((s, u) => s + u.characters, 0) / required.reduce((s, u) => s + u.characters, 0);
  const noiseLeakage = noise.length ? noise.filter(u => u.present).length / noise.length : 0;
  const noiseTokens = new Set(noise.flatMap(u => u.alignment.map(p => p.output)));
  const noiseCharacters = [...noiseTokens].reduce((s, j) => s + characterLength(text.slice(tokens[j].start, tokens[j].end)), 0);
  const titles = content.filter(u => u.role === 'title');
  const titlePresent = titles.length > 0 && titles.every(u => u.present);
  const titleFirst = titlePresent && titles.every(t => t.position !== null && required.filter(u => u.role !== 'title').every(u => u.present && u.position !== null && t.position < u.position));
  const orderUnassignedUnits = present.filter(u => u.position === null).length;
  const orderTau = orderUnassignedUnits ? 0 : kendallTau(present.map(u => u.position));
  const completePass = contentRecall >= opts.completeThreshold && titlePresent;
  const cleanPass = completePass && noiseLeakage <= opts.noiseThreshold && orderTau >= opts.orderThreshold;
  const outputCharacters = characterLength(text);
  return { scoringVersion: SCORING_VERSION, contentRecall, contentCharacterRecall, noiseLeakage, noiseCharacterShare: outputCharacters ? noiseCharacters / outputCharacters : 0,
    titlePresent, titleFirst, orderTau, orderUnassignedUnits, completePass, cleanPass, noFallbackPass: cleanPass && options.ok !== false && !options.fallback,
    requiredUnits: required.length, presentRequiredUnits: present.length, noiseUnits: noise.length, outputCharacters,
    content, noise, thresholds: opts };
}
module.exports = { DEFAULTS, SCORING_VERSION, normalize, characterLength, extractText, htmlText, tokenize, lcsAlignment, matchUnit, alignContent, kendallTau, score };
if (require.main === module) {
  const [outputFile, referenceFile, ...flags] = process.argv.slice(2);
  if (!referenceFile) { console.error('Usage: node score.cjs OUTPUT REFERENCE [--format=html|text] [--presenceThreshold=0.9 ...]'); process.exitCode = 1; }
  else {
    const options = { format: /\.html?$/i.test(outputFile) ? 'html' : 'text' };
    for (const flag of flags) { const [k, v] = flag.replace(/^--/, '').split('='); if (k !== 'format' && !(k in DEFAULTS)) throw Error('unknown-option:' + k); options[k] = k === 'format' ? v : Number(v); }
    console.log(JSON.stringify(score(fs.readFileSync(outputFile, 'utf8'), JSON.parse(fs.readFileSync(referenceFile, 'utf8')), options), null, 2));
  }
}
