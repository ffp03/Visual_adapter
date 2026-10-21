// Shared deterministic DOM guard. No network, model, reference labels or site rules.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PreservationCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const NOISE = 'script,style,link,noscript,iframe,object,embed,template,svg animate,svg set,svg animateMotion,svg animateTransform,nav,footer,[role="navigation"],[role="banner"],[role="contentinfo"]';
    const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,pre,code,table,ul,ol,dl,blockquote,figure,img,a[href],[role="comment"],[itemprop="commentText"]';
    const norm = value => (value || '').replace(/\s+/g, ' ').trim();
    const outsideNoise = node => !node.closest(NOISE);
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
    function clean(element, doc, preserveBody = false) {
        const clone = element.cloneNode(true);
        all(clone, NOISE).forEach(node => node.remove());
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
    function signature(node, doc) {
        const clone = clean(node, doc);
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
            descriptor: { version: 2, boundary: scope.semantic ? 'semantic' : 'body-indeterminate',
                landmarks: [...new Set(outermost([...doc.querySelectorAll('main,article,[role="main"]')].filter(outsideNoise)).map(node =>
                    node.tagName + ':' + (node.getAttribute('role') || '')))].sort() } };
    }
    function assess(doc, reader, inventory = inspect(doc)) {
        const target = typeof reader === 'string' ? (() => { const div = doc.createElement('div'); div.innerHTML = reader; return div; })() : reader;
        const available = new Map();
        const hints = new Map();
        for (const role of inventory.roles.filter(role => role.signature)) {
            const tag = role.node.tagName === 'BODY' ? 'div' : role.node.tagName.toLowerCase();
            if (!hints.has(tag)) hints.set(tag, new Set());
            hints.get(tag).add(norm(clean(role.node, doc).textContent).length);
        }
        const tags = [...hints.keys()];
        // Only index role-bearing tags, never every ancestor subtree.
        for (const node of tags.length ? all(target, tags.join(',')) : []) {
            if (!hints.get(node.tagName.toLowerCase()).has(norm(node.textContent).length)) continue;
            const key = signature(node, doc); available.set(key, (available.get(key) || 0) + 1);
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
    function render(doc, regions, exclude) {
        const wrapper = doc.createElement('div');
        const selected = regions.map(region => {
            const selected = matches(doc, region.selector);
            if (selected.length !== 1) throw Error('region-must-match-exactly-once');
            return selected[0];
        });
        if (outermost(selected).length !== selected.length) throw Error('overlapping-regions');
        selected.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 2 ? 1 : -1);
        for (const node of selected) {
            const clone = clean(node, doc);
            for (const exclusion of exclude || []) all(clone, exclusion).forEach(n => n.remove());
            // A detached matching root cannot remove itself from its parent.
            if (!(exclude || []).some(s => clone.matches(s))) wrapper.appendChild(clone);
        }
        const transferred = doc.createElement('div'); transferred.innerHTML = wrapper.innerHTML;
        return transferred;
    }
    function apply(doc, procedure, inventory = inspect(doc)) {
        try {
            if (procedure?.schemaVersion !== 2 || !Array.isArray(procedure.regions) || !procedure.regions.length) throw Error('unsupported-procedure');
            if (JSON.stringify(inventory.descriptor) !== JSON.stringify(procedure.preconditions?.scope)) throw Error('structural-scope-mismatch');
            if (procedure.regions.some(region => region.fragileSelector || region.selector.includes(':nth-of-type('))) throw Error('unstable-region-selector');
            const reader = render(doc, procedure.regions, procedure.exclude);
            const coverage = assess(doc, reader, inventory);
            return { accepted: coverage.accepted, html: coverage.accepted ? reader.innerHTML : '', reason: coverage.accepted ? null : 'role-preservation-failed', coverage };
        } catch (error) { return { accepted: false, html: '', reason: error.message }; }
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
        const regions = nodes.map(node => ({ role: node === modelNode ? 'model-reading-region' : 'required-reading-region', selector: selector(node, doc), required: true, fragileSelector: selector(node, doc).includes(':nth-of-type(') }));
        if (regions.length !== 1 || regions[0].selector !== legacy.main) adjustments.push({ kind: nodes.length !== 1 || nodes[0] !== modelNode ? 'explicit-region-expansion' : 'selector-canonicalization', originalMain: legacy.main, regions: regions.map(r => r.selector) });
        const procedure = { schemaVersion: 2, serialization: 'body-region-as-div', taskScope: 'reading', applicationFunctionalityVerified: false, name: legacy.name, regions, exclude: [], preconditions: { scope: inventory.descriptor },
            adjustments, modelCandidate: { main: legacy.main, exclude: [...legacy.exclude], name: legacy.name },
            supplementation: nodes.length !== 1 || nodes[0] !== modelNode, modelSelectionSuperseded: !nodes.includes(modelNode),
            compiler: 'role-preservation-v2', context: { boundary: inventory.boundary, limits: inventory.limits, unsupported: inventory.unsupported, unsupportedInteraction: inventory.unsupportedInteraction } };
        for (const exclusion of legacy.exclude) {
            const trial = render(doc, regions, [...procedure.exclude, exclusion]);
            const coverage = assess(doc, trial, inventory);
            if (coverage.accepted) procedure.exclude.push(exclusion);
            else adjustments.push({ kind: 'dropped-unsafe-exclusion', selector: exclusion, missing: coverage.missing });
        }
        procedure.compilationAdjusted = adjustments.length > 0;
        procedure.pureModelSelection = !procedure.supplementation && !adjustments.some(adjustment => adjustment.kind === 'dropped-unsafe-exclusion');
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
        return html.length <= 100000 ? { validationHTML: html, validationComplete: true, validationContextScope: 'complete-client-sanitized-body', interactionValuesOmitted: true, structuralDescriptor: inventory.descriptor }
            : { validationComplete: false, validationLimitation: 'complete-sanitized-body-exceeds-100k', structuralDescriptor: inventory.descriptor };
    }
    return { matches, inspect, compile, apply, assess, applyLegacy, fallback, validationContext, descriptor: doc => inspect(doc).descriptor };
});
