// Shared deterministic DOM guard. No network, model, reference labels or site rules.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PreservationCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const validationLimits = Object.freeze({ legacyCharacters: 100000, decodedBytes: 1048576, compressedBytes: 131072, expansionRatio: 100, requestBytes: 262144, encoding: 'gzip-base64-v1' });
    const NOISE = 'script,style,link,noscript,iframe,object,embed,template,svg animate,svg set,svg animateMotion,svg animateTransform,footer,[role="banner"],[role="contentinfo"]';
    const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,pre,code,table,ul,ol,dl,blockquote,figure,img,a[href],[role="comment"],[itemprop="commentText"]';
    const norm = value => (value || '').replace(/\s+/g, ' ').trim();
    const NAVIGATION = 'nav,[role="navigation"]';
    const READING = 'main,article,[role="main"]';
    const isNoise = (node, readingArtifact = false) => node.matches(NOISE)
        || (!readingArtifact && node.matches(NAVIGATION) && !node.parentElement?.closest(READING));
    const outsideNoise = node => {
        if (node.closest(NOISE)) return false;
        for (let nav = node.closest(NAVIGATION); nav; nav = nav.parentElement?.closest(NAVIGATION)) {
            if (isNoise(nav)) return false;
        }
        return true;
    };
    const matches = (doc, selector) => [...doc.querySelectorAll(selector)].filter(outsideNoise);
    const outermost = nodes => {
        const selected = new Set(nodes);
        return nodes.filter(node => { for (let parent = node.parentElement; parent; parent = parent.parentElement) if (selected.has(parent)) return false; return true; });
    };
    const all = (node, selector) => [...(node.matches?.(selector) ? [node] : []), ...node.querySelectorAll(selector)];
    function path(node) {
        const parts = [];
        for (let current = node; current?.nodeType === 1; current = current.parentElement) {
            const tag = current.tagName.toLowerCase();
            const siblings = current.parentElement ? [...current.parentElement.children].filter(n => n.tagName === current.tagName) : [current];
            parts.unshift(tag + ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')');
        }
        return parts.join(' > ');
    }
    function selector(node, doc, lookups = new Map()) {
        const unique = candidate => {
            if (!lookups.has(candidate)) lookups.set(candidate, matches(doc, candidate).length === 1);
            return lookups.get(candidate);
        };
        if (['BODY', 'MAIN', 'ARTICLE'].includes(node.tagName) && unique(node.tagName)) return node.tagName.toLowerCase();
        if (node.getAttribute('role')) {
            const candidate = '[role=' + JSON.stringify(node.getAttribute('role')) + ']';
            if (unique(candidate)) return candidate;
        }
        if (node.id) {
            const candidate = '[id=' + JSON.stringify(node.id) + ']';
            try { if (unique(candidate)) return candidate; } catch {}
        }
        if (node.classList.length) {
            const candidate = node.tagName.toLowerCase() + [...node.classList].slice(0, 3).map(value => '[class~=' + JSON.stringify(value) + ']').join('');
            try { if (unique(candidate)) return candidate; } catch {}
        }
        return path(node);
    }
    const DESCRIPTOR_VERSION = 3;
    const positional = value => /:(?:nth-|first-|last-|only-)/i.test(value);
    function balancedSelector(value) {
        const stack = []; let quote = null, escaped = false;
        for (const character of value) {
            if (escaped) { escaped = false; continue; }
            if (character === '\\') { escaped = true; continue; }
            if (quote) { if (character === quote) quote = null; continue; }
            if (character === '"' || character === "'") { quote = character; continue; }
            if (character === '[' || character === '(') stack.push(character);
            if (character === ']' || character === ')') {
                if (stack.pop() !== (character === ']' ? '[' : '(')) return false;
            }
        }
        return !quote && !escaped && !stack.length;
    }
    function regionScope(node) {
        if (node.tagName === 'BODY') return { kind: 'body' };
        if (node.matches('main,[role="main"]')) return { kind: 'primary' };
        if (node.matches('article,[role="article"]')) return { kind: 'article' };
        const envelope = node.parentElement?.closest(READING);
        return { kind: 'element', tag: node.tagName, role: node.getAttribute('role') || null,
            envelope: envelope ? (envelope.matches('article') ? 'article' : 'primary') : null };
    }
    function sameScope(node, scope, primary) {
        if (!scope) return node.tagName !== 'BODY' || primary.trim().toLowerCase() === 'body';
        return JSON.stringify(regionScope(node)) === JSON.stringify(scope);
    }
    function selectorChoices(node, doc, primary) {
        const tag = node.tagName.toLowerCase(), candidates = [primary];
        if (['BODY', 'MAIN', 'ARTICLE'].includes(node.tagName)) candidates.push(tag);
        if (node.getAttribute('role')) candidates.push('[role=' + JSON.stringify(node.getAttribute('role')) + ']');
        const classes = [...node.classList].slice(0, 3).map(value => '[class~=' + JSON.stringify(value) + ']').join('');
        if (classes) candidates.push(tag + classes);
        if (node.id) candidates.push('[id=' + JSON.stringify(node.id) + ']');
        if (classes) candidates.push(classes);
        candidates.push(tag);
        const chosen = [];
        for (const candidate of candidates) {
            if (!candidate || candidate.length > 500 || positional(candidate) || !balancedSelector(candidate) || chosen.includes(candidate)) continue;
            try { const resolved = matches(doc, candidate); if (resolved.length === 1 && resolved[0] === node) chosen.push(candidate); } catch {}
            if (chosen.length === 4) break;
        }
        if (chosen[0] !== primary) throw Error('invalid-primary-region-selector');
        return chosen;
    }
    function familyDescriptor(doc, scope) {
        const landmarks = outermost([...doc.querySelectorAll(READING)].filter(outsideNoise));
        const envelopes = landmarks.length ? landmarks : [doc.body];
        const nodes = envelopes.flatMap(root => all(root, '*')).filter(node => outsideNoise(node) && !node.closest(NAVIGATION));
        const commentSelector = '[role="comment"],[itemprop="commentText"],[itemprop~="comment"]';
        const articles = outermost(nodes.filter(node => node.matches('article,[role="article"]') && !node.closest(commentSelector)));
        const narrative = nodes.filter(node => !node.closest(commentSelector) && (node.matches('p,pre,code,table,blockquote,[itemprop="text"]')
            || (!node.closest('h1,h2,h3,h4,h5,h6,input,textarea,select,button') && [...node.childNodes].some(child => child.nodeType === 3 && norm(child.nodeValue)))));
        const outsideArticles = narrative.some(node => !articles.some(article => article.contains(node)));
        const comments = nodes.filter(node => node.matches(commentSelector));
        const dominant = node => narrative.every(block => node.contains(block));
        const typeNodes = type => nodes.filter(node => (node.getAttribute('itemtype') || '').split(/\s+/).some(value => value.split(/[\/#]/).pop() === type));
        const explicitDiscussion = typeNodes('DiscussionForumPosting').some(dominant);
        const explicitCollection = typeNodes('ItemList').some(dominant) || nodes.some(node => node.matches('[role="list"]') && dominant(node)
            && [...node.querySelectorAll('[role="listitem"]')].some(item => item.querySelector('h1,h2,h3,h4,h5,h6') && item.querySelector('a[href]')));
        let archetype = 'unmarked';
        if (explicitDiscussion || (comments.length && !articles.length && !narrative.length)) archetype = 'discussion';
        else if (articles.length === 1 && !outsideArticles) archetype = 'article';
        else if (explicitCollection || (articles.length >= 2 && !outsideArticles)) archetype = 'collection';
        else if (scope.semantic) archetype = 'document';
        const roles = [...new Set(landmarks.map(node => node.matches('article') ? 'article' : 'primary'))].sort();
        return { version: DESCRIPTOR_VERSION, policy: 'semantic-reading-envelope', archetype,
            envelope: roles.length ? roles : ['body'],
            topology: archetype === 'collection' ? 'reading>entries' : archetype === 'discussion' ? 'reading>comments' : archetype === 'article' ? 'reading>article' : 'reading>blocks' };
    }
    function boundary(doc) {
        let roots = outermost([...doc.querySelectorAll('main,article,[role="main"]')].filter(outsideNoise));
        const semantic = roots.length > 0;
        if (semantic) {
            // Sibling discussions / repeated reading blocks are part of this local
            // boundary, including material outside an article's body container.
            const siblings = roots.flatMap(node => [...(node.parentElement?.children || [])])
                .filter(node => outsideNoise(node) && !node.matches('header') &&
                    (node.matches(BLOCKS) || node.querySelector(BLOCKS)));
            roots = outermost([...new Set([...roots, ...siblings])]);
        } else {
            // Without semantic markup, only explicit reading blocks are required.
            // Arbitrary BODY text is not asserted to be a complete article.
            roots = doc.body ? [doc.body] : [];
        }
        const title = roots.flatMap(root => all(root, 'h1')).find(outsideNoise) || [...doc.querySelectorAll('h1')].find(node => outsideNoise(node) && (semantic || !node.closest('header')));
        if (title && !roots.some(root => root.contains(title))) roots.push(title);
        roots.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 2 ? 1 : -1);
        return { roots: outermost(roots), semantic, title };
    }
    function clean(element, doc, preserveBody = false, readingArtifact = false) {
        const clone = element.cloneNode(true);
        // Decide against ORIGINAL ancestry: a detached clone of reading NAV or
        // one of its subregions no longer has its MAIN/ARTICLE ancestor.
        const originals = all(element, '*'), copies = all(clone, '*');
        originals.forEach((original, index) => { if (isNoise(original, readingArtifact)) copies[index].remove(); });
        all(clone, 'input,textarea').forEach(node => { node.removeAttribute('value'); node.textContent = ''; });
        all(clone, '*').forEach(node => {
            [...node.attributes].forEach(attribute => {
                if (/^on/i.test(attribute.name) || ['srcdoc', 'action', 'formaction'].includes(attribute.name)) node.removeAttribute(attribute.name);
            });
            for (const attribute of ['href', 'src', 'poster', 'xlink:href']) {
                if (!node.hasAttribute(attribute)) continue;
                const raw = node.getAttribute(attribute);
                try {
                    const url = new URL(raw, doc.baseURI);
                    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) && !(attribute === 'src' && /^data:image\//i.test(raw))) node.removeAttribute(attribute);
                    else node.setAttribute(attribute, raw.startsWith('#') && attribute === 'href' ? raw : url.href);
                } catch { node.removeAttribute(attribute); }
            }
            // Resolve simple srcset candidates; complex data URLs remain explicit
            // indeterminate material rather than being misparsed as comma lists.
            if (node.hasAttribute('srcset') && !node.getAttribute('srcset').includes('data:')) {
                node.setAttribute('srcset', node.getAttribute('srcset').split(',').map(candidate => {
                    const [raw, ...size] = candidate.trim().split(/\s+/);
                    try { const url = new URL(raw, doc.baseURI); return /^https?:$/.test(url.protocol) ? [url.href, ...size].join(' ') : ''; } catch { return ''; }
                }).filter(Boolean).join(', '));
            }
        });
        if (clone.tagName === 'BODY' && !preserveBody) {
            const region = doc.createElement('div');
            for (const attribute of [...clone.attributes]) region.setAttribute(attribute.name, attribute.value);
            while (clone.firstChild) region.appendChild(clone.firstChild);
            return region;
        }
        return clone;
    }
    function signature(node, doc, readingArtifact = false) {
        // Reader fragments already passed source-ancestry sanitization. Their
        // region wrappers may omit MAIN; canonicalization must retain reading NAV.
        const clone = clean(node, doc, false, readingArtifact);
        // Removing inactive nodes can leave adjacent text nodes. Serialization
        // merges these without changing text; compare the same partitioning.
        // normalize() preserves every character, including PRE/CODE whitespace.
        clone.normalize();
        // Attribute ordering and presentation are irrelevant; reading structure,
        // exact normalized text, destinations and fragment identities are not.
        function encode(n, exact = false) {
            if (n.nodeType === 3) return exact ? n.nodeValue.replace(/\r\n?/g, '\n') : norm(n.nodeValue);
            if (n.nodeType !== 1) return '';
            const attrs = ['id', 'name', 'href', 'src', 'srcset', 'poster', 'alt', 'title', 'colspan', 'rowspan', 'start', 'value', 'scope', 'headers']
                .filter(key => n.hasAttribute(key)).map(key => [key, n.getAttribute(key)]);
            return [n.tagName, attrs, [...n.childNodes].map(child => encode(child, exact || n.matches('pre,code'))).filter(Boolean)];
        }
        return JSON.stringify(encode(clone));
    }
    function inspect(doc) {
        const scope = boundary(doc), lookups = new Map();
        const sourceSelector = node => selector(node, doc, lookups);
        const nodes = outermost(scope.roots.flatMap(root => all(root, BLOCKS + ',canvas,math,video,audio')).filter(node => outsideNoise(node) && (scope.semantic || !node.closest('header'))));
        const protectedNodes = new Set(nodes);
        const roles = nodes.map(node => ({ role: node.matches('h1') ? 'primary-heading' : node.matches('pre,code') ? 'code' :
            node.matches('table,ul,ol,dl') ? 'reading-structure' : node.matches('img,figure') ? 'image-caption' : 'reading-block',
            selector: sourceSelector(node), signature: signature(node, doc), node }));
        // Capture text outside marked blocks inside semantic reading regions too.
        for (const root of scope.roots) {
            const stack = [root];
            while (stack.length) {
                const parent = stack.pop();
                if (!outsideNoise(parent) || protectedNodes.has(parent) || parent.matches('input,textarea,select,button') || (!scope.semantic && parent.matches('header'))) continue;
                stack.push(...parent.children);
                const text = [...parent.childNodes].filter(n => n.nodeType === 3).map(n => norm(n.nodeValue)).filter(Boolean);
                if (text.length) roles.push({ role: 'unwrapped-prose', selector: sourceSelector(parent), text, node: parent });
            }
        }
        const links = scope.roots.flatMap(root => all(root, 'a[href]')).filter(outsideNoise);
        for (const link of links) {
            const href = link.getAttribute('href');
            if (!href?.startsWith('#') || href.length === 1) continue;
            let id; try { id = decodeURIComponent(href.slice(1)); } catch { id = href.slice(1); }
            const target = doc.getElementById(id) || [...doc.querySelectorAll('a[name]')].find(a => a.name === id);
            if (target && outsideNoise(target) && !roles.some(role => role.node.contains(target))) {
                const readingTarget = target.closest('table,ul,ol,figure,pre') || target;
                if (!roles.some(role => role.node === readingTarget)) roles.push({ role: 'fragment-target', selector: sourceSelector(readingTarget), signature: signature(readingTarget, doc), node: readingTarget });
            }
        }
        return { roles, roots: scope.roots, scopeIndeterminate: !scope.semantic, boundary: scope.semantic ? 'semantic-regions-and-reading-siblings' : 'clean-body-scope-indeterminate',
            limits: ['css-generated-and-background-content-not-assessed', ...(scope.semantic ? [] : ['unmarked-body-content-indeterminate'])],
            unsupported: scope.roots.flatMap(root => all(root, 'canvas,math,video,audio')).filter(outsideNoise).filter(node => !norm(node.getAttribute('aria-label') || node.getAttribute('alttext') || node.textContent)).map(node => 'unrepresented-' + node.tagName.toLowerCase()),
            unsupportedInteraction: scope.roots.some(root => root.matches('input,textarea,form,select,button') || root.querySelector('input,textarea,form,select,button')) ? ['application-controls-not-verified'] : [],
            descriptor: familyDescriptor(doc, scope) };
    }
    function sourceHints(doc, inventory) {
        const hints = new Map();
        for (const role of inventory.roles.filter(role => role.signature)) {
            const tag = role.node.tagName === 'BODY' ? 'div' : role.node.tagName.toLowerCase();
            if (!hints.has(tag)) hints.set(tag, new Set());
            hints.get(tag).add(norm(clean(role.node, doc).textContent).length);
        }
        return hints;
    }
    // These caches live only for one synchronous apply. Eviction or an oversized
    // entry merely repeats the original work; neither can affect acceptance.
    function boundedMemo() {
        const entries = new Map(); let characters = 0;
        return {
            get: key => entries.get(key)?.value,
            put(key, value, size) {
                if (size > 2000000) return;
                while (entries.size >= 2048 || characters + size > 2000000) {
                    const oldest = entries.keys().next().value;
                    characters -= entries.get(oldest).size; entries.delete(oldest);
                }
                entries.set(key, { value, size }); characters += size;
            }
        };
    }
    function readerSignature(node, doc, context) {
        if (!context) return signature(node, doc, true);
        const ancestry = [];
        for (let parent = node.parentElement; parent; parent = parent.parentElement) ancestry.push([parent.namespaceURI, parent.tagName]);
        const key = JSON.stringify([context.base, node.namespaceURI, node.tagName, ancestry, node.outerHTML]);
        let result = context.signatures.get(key);
        if (result === undefined) {
            result = signature(node, doc, true);
            context.signatures.put(key, result, key.length + result.length);
        }
        return result;
    }
    function assess(doc, reader, inventory = inspect(doc)) {
        return assessWithContext(doc, reader, inventory);
    }
    function assessWithContext(doc, reader, inventory, context) {
        const target = typeof reader === 'string' ? (() => { const div = doc.createElement('div'); div.innerHTML = reader; return div; })() : reader;
        const available = new Map();
        const hints = context ? (context.hints ||= sourceHints(doc, inventory)) : sourceHints(doc, inventory);
        const tags = [...hints.keys()];
        // Only index role-bearing tags, never every ancestor subtree.
        for (const node of tags.length ? all(target, tags.join(',')) : []) {
            if (!hints.get(node.tagName.toLowerCase()).has(norm(node.textContent).length)) continue;
            const key = readerSignature(node, doc, context); available.set(key, (available.get(key) || 0) + 1);
        }
        const missing = [], consumedText = new Set();
        for (const role of inventory.roles) {
            if (role.text) {
                // Same parent tag and exact direct text, not loose whole-page inclusion.
                const match = (role.node.tagName === 'BODY' ? all(target, 'div') : all(target, role.node.tagName.toLowerCase())).find(node => !consumedText.has(node) && JSON.stringify([...node.childNodes].filter(n => n.nodeType === 3).map(n => norm(n.nodeValue)).filter(Boolean)) === JSON.stringify(role.text));
                if (!match) missing.push({ role: role.role, selector: role.selector });
                else consumedText.add(match);
            } else {
                const count = available.get(role.signature) || 0;
                if (!count) missing.push({ role: role.role, selector: role.selector });
                else available.set(role.signature, count - 1);
            }
        }
        return { accepted: inventory.roles.length > 0 && !missing.length && !inventory.unsupported.length,
            required: inventory.roles.length, retained: inventory.roles.length - missing.length, missing,
            taskScope: 'reading', applicationFunctionalityVerified: false, scopeIndeterminate: inventory.scopeIndeterminate, completeArtifactVerified: false,
            boundary: inventory.boundary, limits: inventory.limits, unsupported: inventory.unsupported, unsupportedInteraction: inventory.unsupportedInteraction,
            guarantee: 'deterministic-local-role-check' };
    }
    function render(doc, regions, exclude, context) {
        const wrapper = doc.createElement('div');
        const selected = regions.map(region => {
            const selected = matches(doc, region.selector);
            if (selected.length !== 1) throw Error('region-must-match-exactly-once');
            return selected[0];
        });
        if (outermost(selected).length !== selected.length) throw Error('overlapping-regions');
        selected.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 2 ? 1 : -1);
        for (const node of selected) {
            let template = context?.regions.get(node);
            let clone;
            if (template) clone = template.cloneNode(true);
            else {
                clone = clean(node, doc);
                if (context) {
                    const size = clone.outerHTML.length;
                    if (size <= 2000000) context.regions.put(node, clone.cloneNode(true), size);
                }
            }
            for (const exclusion of exclude || []) all(clone, exclusion).forEach(n => n.remove());
            // A detached matching root cannot remove itself from its parent.
            if (!(exclude || []).some(s => clone.matches(s))) wrapper.appendChild(clone);
        }
        const transferred = doc.createElement('div'); transferred.innerHTML = wrapper.innerHTML;
        return transferred;
    }
    function apply(doc, procedure, inventory = inspect(doc)) {
        let attemptedCombinations = 0, visitedStates = 0, stateBudgetExceeded = false, lastCoverage, lastReason = 'region-must-match-exactly-once';
        try {
            if (procedure?.schemaVersion !== 2 || !Array.isArray(procedure.regions) || !procedure.regions.length) throw Error('unsupported-procedure');
            if (procedure.preconditions?.scope?.version !== DESCRIPTOR_VERSION || JSON.stringify(inventory.descriptor) !== JSON.stringify(procedure.preconditions.scope)) throw Error('structural-scope-mismatch');
            const options = procedure.regions.map(region => {
                const choices = region.selectors === undefined ? [region.selector] : region.selectors;
                if (!Array.isArray(choices) || choices.length < 1 || choices.length > 4 || choices[0] !== region.selector || new Set(choices).size !== choices.length) throw Error('invalid-region-selectors');
                if (region.fragileSelector || choices.some(value => typeof value !== 'string' || !value.trim() || value.length > 500 || positional(value) || !balancedSelector(value))) throw Error('unstable-region-selector');
                const unique = new Set(), candidates = [];
                for (const value of choices) {
                    let resolved; try { resolved = matches(doc, value); } catch { throw Error('invalid-region-selector'); }
                    if (resolved.length !== 1 || !sameScope(resolved[0], region.scope, region.selector) || unique.has(resolved[0])) continue;
                    unique.add(resolved[0]); candidates.push({ selector: value, node: resolved[0] });
                }
                return candidates;
            });
            if (options.some(values => !values.length)) throw Error('region-must-match-exactly-once');
            const context = options.some(values => values.length > 1)
                ? { base: doc.baseURI, hints: null, regions: boundedMemo(), signatures: boundedMemo() } : undefined;
            const selected = [], stateLimit = Math.min(16384, 64 * procedure.regions.length * 4);
            function search(index) {
                if (visitedStates >= stateLimit) { stateBudgetExceeded = true; return null; }
                visitedStates++;
                if (attemptedCombinations >= 64) return null;
                if (index !== options.length) {
                    for (const choice of options[index]) { selected.push(choice); const result = search(index + 1); selected.pop(); if (result) return result; if (attemptedCombinations >= 64) break; }
                    return null;
                }
                attemptedCombinations++;
                const nodes = selected.map(choice => choice.node);
                if (new Set(nodes).size !== nodes.length || outermost(nodes).length !== nodes.length) { lastReason = 'overlapping-regions'; return null; }
                const chosenSelectors = selected.map(choice => choice.selector);
                const reader = render(doc, chosenSelectors.map(selector => ({ selector })), procedure.exclude, context);
                const coverage = assessWithContext(doc, reader, inventory, context); lastCoverage = coverage;
                if (!coverage.accepted) { lastReason = 'role-preservation-failed'; return null; }
                return { accepted: true, html: reader.innerHTML, reason: null, coverage, chosenSelectors,
                    alternativeUsed: chosenSelectors.some((value, i) => value !== procedure.regions[i].selector), attemptedCombinations, visitedStates };
            }
            const result = search(0);
            return result || { accepted: false, html: '', reason: attemptedCombinations >= 64 || stateBudgetExceeded ? 'selector-search-budget-exhausted' : lastReason,
                coverage: lastCoverage, chosenSelectors: [], alternativeUsed: false, attemptedCombinations, visitedStates };
        } catch (error) { return { accepted: false, html: '', reason: error.message, chosenSelectors: [], alternativeUsed: false, attemptedCombinations, visitedStates }; }
    }
    function compile(doc, legacy, inventory = inspect(doc)) {
        if (!legacy || typeof legacy.main !== 'string' || !legacy.main.trim() || legacy.main.length > 500 || typeof legacy.name !== 'string' || legacy.name.length > 120 ||
            !Array.isArray(legacy.exclude) || legacy.exclude.length > 30 || legacy.exclude.some(s => typeof s !== 'string' || !s.trim() || s.length > 500)) throw Error('invalid-model-rule');
        const selected = matches(doc, legacy.main);
        if (selected.length !== 1) throw Error('model-region-must-match-exactly-once');
        const adjustments = [];
        const modelNode = selected[0];
        let original = modelNode;
        if (original.closest('table') && original.tagName !== 'TABLE') original = original.closest('table');
        if (original.closest('ul,ol') && !['UL', 'OL'].includes(original.tagName)) original = original.closest('ul,ol');
        let nodes = outermost([...new Set([original, ...inventory.roles.filter(role => !original.contains(role.node)).map(role => role.node)])]);
        if (nodes.some(node => selector(node, doc).includes(':nth-of-type('))) {
            let common = nodes[0];
            while (common && !nodes.every(node => common.contains(node))) common = common.parentElement;
            while (common && selector(common, doc).includes(':nth-of-type(')) common = common.parentElement;
            if (!common) throw Error('stable-reading-region-unavailable');
            adjustments.push({ kind: 'stable-common-ancestor-expansion', originalRegions: nodes.map(node => selector(node, doc)), appliedRegion: selector(common, doc) });
            nodes = [common];
        }
        // Preserve an already unique, nonpositional model selector. Replacing
        // article.product_page with article loses its disambiguating scope when
        // a later page adds nested article cards.
        const regionSelector = node => node === modelNode && !/:(?:nth-|first-|last-|only-)/i.test(legacy.main)
            ? legacy.main : selector(node, doc);
        const regions = nodes.map(node => { const primary = regionSelector(node); return { role: node === modelNode ? 'model-reading-region' : 'required-reading-region', selector: primary, selectors: selectorChoices(node, doc, primary), scope: regionScope(node), required: true, fragileSelector: positional(primary) }; });
        const alternativeRegions = regions.filter(region => region.selectors.length > 1);
        if (alternativeRegions.length) adjustments.push({ kind: 'predeclared-selector-alternatives', regions: alternativeRegions.map(region => ({ selector: region.selector, selectors: [...region.selectors] })) });
        if (regions.length !== 1 || regions[0].selector !== legacy.main) adjustments.push({ kind: nodes.length !== 1 || nodes[0] !== modelNode ? 'explicit-region-expansion' : 'selector-canonicalization', originalMain: legacy.main, regions: regions.map(r => r.selector) });
        const procedure = { schemaVersion: 2, serialization: 'body-region-as-div', taskScope: 'reading', applicationFunctionalityVerified: false, name: legacy.name, regions, exclude: [], preconditions: { scope: inventory.descriptor },
            adjustments, modelCandidate: { main: legacy.main, exclude: [...legacy.exclude], name: legacy.name },
            supplementation: nodes.length !== 1 || nodes[0] !== modelNode, modelSelectionSuperseded: !nodes.includes(modelNode),
            compiler: 'role-preservation-v2', context: { boundary: inventory.boundary, limits: inventory.limits, unsupported: inventory.unsupported, unsupportedInteraction: inventory.unsupportedInteraction } };
        for (const exclusion of legacy.exclude) {
            if (!doc.querySelectorAll(exclusion).length) {
                adjustments.push({ kind: 'dropped-unobserved-exclusion', selector: exclusion });
                continue;
            }
            const trial = render(doc, regions, [...procedure.exclude, exclusion]);
            const coverage = assess(doc, trial, inventory);
            if (coverage.accepted) procedure.exclude.push(exclusion);
            else adjustments.push({ kind: 'dropped-unsafe-exclusion', selector: exclusion, missing: coverage.missing });
        }
        procedure.compilationAdjusted = adjustments.length > 0;
        procedure.pureModelSelection = !procedure.supplementation && !adjustments.some(adjustment => adjustment.kind.startsWith('dropped-'));
        procedure.addedRegions = regions.filter(region => region.role !== 'model-reading-region').map(region => region.selector);
        const result = apply(doc, procedure, inventory);
        if (!result.accepted) throw Error(result.reason + ': ' + JSON.stringify(result.coverage));
        return procedure;
    }
    function applyLegacy(doc, legacy, inventory = inspect(doc)) {
        try {
            const reader = render(doc, [{ selector: legacy.main }], legacy.exclude || []);
            const coverage = assess(doc, reader, inventory);
            return { accepted: coverage.accepted, html: coverage.accepted ? reader.innerHTML : '', reason: coverage.accepted ? null : 'role-preservation-failed', coverage };
        } catch (error) { return { accepted: false, html: '', reason: error.message }; }
    }
    function fallback(doc, inventory = inspect(doc)) {
        const reader = render(doc, outermost([...inventory.roots, ...inventory.roles.filter(role => role.role === 'fragment-target').map(role => role.node)]).map(node => ({ selector: selector(node, doc) })), []);
        return { html: reader.innerHTML, coverage: assess(doc, reader, inventory) };
    }
    function validationContext(doc, inventory = inspect(doc)) {
        // A reading-only fragment can remove outside selector duplicates and
        // falsely establish uniqueness. Preserve the full sanitized BODY or
        // decline admission; the bounded model sample is a separate input.
        const body = clean(doc.body, doc, true);
        const html = body.outerHTML;
        return html.length <= validationLimits.legacyCharacters ? { validationHTML: html, validationComplete: true, validationContextScope: 'complete-client-sanitized-body', interactionValuesOmitted: true, structuralDescriptor: inventory.descriptor }
            : { validationComplete: false, validationLimitation: 'complete-sanitized-body-exceeds-100k', structuralDescriptor: inventory.descriptor };
    }
    async function prepareValidationContext(doc, inventory = inspect(doc), analysis = {}) {
        const html = clean(doc.body, doc, true).outerHTML;
        const metadata = { validationContextScope: 'complete-client-sanitized-body', interactionValuesOmitted: true, structuralDescriptor: inventory.descriptor };
        // Mirror the background's complete request fields, including JSON escaping
        // and UTF-8, rather than treating JavaScript character count as byte size.
        const request = { protocol: 2, hostname: analysis.hostname || doc.location?.hostname || '', html: analysis.html || '', modelEvidence: analysis.modelEvidence,
            validationHTML: html, validationComplete: true, validationContextScope: metadata.validationContextScope, structuralDescriptor: inventory.descriptor, exampleKey: '0'.repeat(64) };
        if (html.length <= validationLimits.legacyCharacters && new TextEncoder().encode(JSON.stringify(request)).length <= validationLimits.requestBytes)
            return { ...metadata, validationHTML: html, validationComplete: true };
        const incomplete = reason => ({ ...metadata, validationComplete: false, validationLimitation: reason });
        const decoded = new TextEncoder().encode(html);
        if (decoded.length > validationLimits.decodedBytes) return incomplete('complete-sanitized-body-exceeds-decoded-byte-bound');
        if (new TextDecoder().decode(decoded) !== html) return incomplete('complete-context-non-roundtrip-utf8');
        if (typeof CompressionStream !== 'function') return incomplete('complete-context-compression-unavailable');
        try {
            const compressed = new Uint8Array(await new Response(new Blob([decoded]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
            if (compressed.length > validationLimits.compressedBytes) return incomplete('complete-context-exceeds-compressed-byte-bound');
            if (decoded.length > compressed.length * validationLimits.expansionRatio) return incomplete('complete-context-exceeds-expansion-ratio');
            let binary = '';
            for (let offset = 0; offset < compressed.length; offset += 8192) binary += String.fromCharCode(...compressed.subarray(offset, offset + 8192));
            return { ...metadata, validationComplete: true, validationTransport: { encoding: validationLimits.encoding, data: btoa(binary), decodedBytes: decoded.length } };
        } catch { return incomplete('complete-context-compression-failed'); }
    }
    return { validationLimits, prepareValidationContext, descriptorVersion: DESCRIPTOR_VERSION, matches, inspect, compile, apply, assess, applyLegacy, fallback, validationContext, descriptor: doc => inspect(doc).descriptor };
});
