// Reference-free v3 rule interpreter. No network and no reader inventory.
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./procedure-core.js') : root.PreservationCore);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ProcedureV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
    'use strict';
    if (!core) throw Error('procedure-core-required');
    const NOISE = 'script,style,link,noscript,iframe,object,embed,template,svg animate,svg set,svg animateMotion,svg animateTransform,footer,[role="banner"],[role="contentinfo"]';
    const NAVIGATION = 'nav,[role="navigation"]', READING = 'main,article,[role="main"]';
    const SUBSTANTIVE = 'p,li,td,th,dd,pre,blockquote,figcaption,h2,h3,h4,h5,h6';
    const SIDEBAR = 'aside,[role="complementary"],nav';
    const ROLES = Object.freeze(['title','byline','date','lede','heading','body','list','table','code','figure','caption','price','specs','description','post','comment','review','item','other']);
    const norm = value => (value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    const hostnameKey = host => typeof host === 'string' ? host.replace(/^www\./, '') : null;
    const all = (node, selector) => [...(node.matches?.(selector) ? [node] : []), ...node.querySelectorAll(selector)];
    const matches = (doc, selector) => core.matches(doc, selector);
    const isNoise = node => node.matches(NOISE) || (node.matches(NAVIGATION) && !node.parentElement?.closest(READING));

    // Preserve frozen core's source-ancestry NOISE/URL semantics. The reviewed
    // v3 policy additionally clears form state and filters srcset per candidate;
    // the frozen core API and its historical behavior remain unchanged.
    function srcsetCandidates(value,doc){
        const candidates=[];let offset=0;
        while(offset<value.length){
            while(offset<value.length&&/[\s,]/.test(value[offset]))offset++;
            if(offset===value.length)break;
            let raw='';while(offset<value.length&&!/\s/.test(value[offset]))raw+=value[offset++];
            const ended=raw.endsWith(',');if(ended)raw=raw.replace(/,+$/,'');
            let descriptor='';if(!ended){let parentheses=0;while(offset<value.length){const c=value[offset++];if(c===','&&!parentheses)break;if(c==='(')parentheses++;if(c===')')parentheses=Math.max(0,parentheses-1);descriptor+=c;}}
            const sizes=descriptor.trim().split(/\s+/).filter(Boolean);
            const width=sizes.filter(s=>/^[1-9]\d*w$/.test(s)),height=sizes.filter(s=>/^[1-9]\d*h$/.test(s)),density=sizes.filter(s=>/^(?:\d+(?:\.\d+)?|\.\d+)x$/.test(s)&&parseFloat(s)>0);
            if(sizes.length!==width.length+height.length+density.length||width.length>1||height.length>1||density.length>1||(density.length&&(width.length||height.length))||(height.length&&!width.length))continue;
            try{const url=new URL(raw,doc.baseURI);if(['http:','https:'].includes(url.protocol)||(url.protocol==='data:'&&/^data:image\//i.test(raw)))candidates.push([url.href,...sizes].join(' '));}catch{}
        }
        return candidates.join(', ');
    }
    function clean(element, doc, preserveBody = false,mapping) {
        const clone = element.cloneNode(true);
        const originals = all(element, '*'), copies = all(clone, '*');
        if(mapping)originals.forEach((node,i)=>mapping.set(node,copies[i]));
        originals.forEach((original, index) => { if (isNoise(original)) copies[index].remove(); });
        all(clone, 'input,textarea,select,option,button').forEach(node => {
            if(!node.matches('button'))node.textContent='';
            if('value' in node)node.value='';
            if('selected' in node)node.selected=false;
            if('checked' in node)node.checked=false;
            for(const key of ['value','selected','checked'])node.removeAttribute(key);
        });
        all(clone, '*').forEach(node => {
            [...node.attributes].forEach(attribute => {
                if (/^on/i.test(attribute.name) || ['srcdoc','action','formaction'].includes(attribute.name)) node.removeAttribute(attribute.name);
            });
            for (const attribute of ['href','src','poster','xlink:href']) {
                if (!node.hasAttribute(attribute)) continue;
                const raw = node.getAttribute(attribute);
                try {
                    const url = new URL(raw, doc.baseURI);
                    if (!['http:','https:','mailto:','tel:'].includes(url.protocol) && !(attribute === 'src' && /^data:image\//i.test(raw))) node.removeAttribute(attribute);
                    else node.setAttribute(attribute, raw.startsWith('#') && attribute === 'href' ? raw : url.href);
                } catch { node.removeAttribute(attribute); }
            }
            if (node.hasAttribute('srcset'))node.setAttribute('srcset',srcsetCandidates(node.getAttribute('srcset'),doc));
        });
        if (clone.tagName === 'BODY' && !preserveBody) {
            const region = doc.createElement('div');
            for (const attribute of [...clone.attributes]) region.setAttribute(attribute.name, attribute.value);
            while (clone.firstChild) region.appendChild(clone.firstChild);
            if(mapping)mapping.set(element,region);
            return region;
        }
        return clone;
    }
    // Exclude form values even from measurements. clean() otherwise follows v2.
    function text(node) {
        const copy = node.cloneNode(true);
        all(copy, 'input,textarea,select,button').forEach(n => n.remove());
        all(copy, NOISE).forEach(n => n.remove());
        return norm(copy.textContent);
    }
    function linkDensity(node) {
        const total = text(node).length;
        const links = all(node, 'a[href]').filter(n => !n.parentElement?.closest('a[href]'));
        return total ? Math.min(1, links.reduce((sum, n) => sum + text(n).length, 0) / total) : 0;
    }
    function validSelector(selector, doc) {
        if (typeof selector !== 'string' || !selector.trim() || selector.length > 300 || /:(?:nth-|first-|last-|only-)/i.test(selector)) return false;
        try { doc.querySelectorAll(selector); return true; } catch { return false; }
    }
    function identityAnchor(selector) {
        if (typeof selector !== 'string') return false;
        const noComments=selector.replace(/\/\*[\s\S]*?\*\//g,'');
        if (/\[\s*(?:id|class)\s*(?:~=|=)\s*(?:"[^"]+"|'[^']+'|[^\]\s]+)\s*\]/i.test(noComments)) return true;
        const tokens=noComments.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'').replace(/\[[^\]]*\]/g,'');
        return /[.#](?:[-_a-zA-Z\u0080-\uffff]|\\)/.test(tokens);
    }
    function nonSidebarText(node) {
        const clone=node.cloneNode(true);
        all(clone,SIDEBAR).forEach(n=>n.remove());
        return clone.matches?.(SIDEBAR) ? '' : text(clone);
    }
    function validate(rule, doc) {
        const reasons = [];
        const object = value => value && typeof value === 'object' && !Array.isArray(value);
        if (!object(rule) || rule.schemaVersion !== 3) return { accepted: false, reasons: ['G1:schema-version'] };
        if (typeof rule.name !== 'string' || !rule.name.trim()) reasons.push('G1:name');
        const hostname=doc.location?.hostname?.toLowerCase();
        if (typeof rule.applicability?.hostname !== 'string' || !rule.applicability.hostname
            || !hostname || hostnameKey(rule.applicability.hostname)!==hostnameKey(hostname)) reasons.push('G1:hostname-binding');
        if (!object(rule.applicability) || !Array.isArray(rule.applicability.anchors) || !rule.applicability.anchors.length) reasons.push('G1:anchors');
        else for (const a of rule.applicability.anchors) {
            if (!object(a) || !validSelector(a.selector, doc) || !Number.isSafeInteger(a.min) || a.min < 0 || !Number.isSafeInteger(a.max) || a.max < a.min) reasons.push('G1:anchor-schema');
        }
        if (Array.isArray(rule.applicability?.anchors) && !rule.applicability.anchors.some(a=>identityAnchor(a?.selector))) reasons.push('G1:non-generic-anchor-required');
        if (!Array.isArray(rule.regions) || !rule.regions.length) reasons.push('G1:regions');
        else for (const r of rule.regions) {
            if (!object(r) || !ROLES.includes(r.role) || !validSelector(r.selector, doc) || typeof r.multiple !== 'boolean' || typeof r.required !== 'boolean') reasons.push('G1:region-schema');
        }
        for (const field of ['exclude','reveal']) {
            if (!Array.isArray(rule[field]) || rule[field].some(s => !validSelector(s, doc))) reasons.push('G1:' + field + '-schema');
        }
        if (!object(rule.provenance) || typeof rule.provenance.model !== 'string' || !rule.provenance.model.trim()
            || !Number.isSafeInteger(rule.provenance.inductionPages) || rule.provenance.inductionPages < 1
            || typeof rule.provenance.createdAt !== 'string' || !Number.isFinite(Date.parse(rule.provenance.createdAt))) reasons.push('G1:provenance');
        return { accepted: !reasons.length, reasons: [...new Set(reasons)] };
    }
    function regionCounts(doc, rule) {
        return rule.regions.flatMap((r, i) => {
            const count = matches(doc, r.selector).length;
            return (!r.multiple && count !== 1) || (r.required && !count) ? [`G1:region-count:${i}:${count}`] : [];
        });
    }
    function render(doc, rule) {
        const validation = validate(rule, doc);
        const reasons = validation.accepted ? regionCounts(doc, rule) : validation.reasons;
        if (reasons.length) throw Error(reasons.join(';'));
        const wrapper = doc.createElement('div');
        // Resolve exclusions/reveals in the ORIGINAL DOM: ancestor selectors must
        // retain their meaning after detaching the selected regions.
        const excluded = rule.exclude.flatMap(s => matches(doc, s));
        const revealed = new Set(rule.reveal.flatMap(s => matches(doc, s)));
        for (const region of rule.regions) for (const node of matches(doc, region.selector)) {
            const originalNodes = all(node, '*');
            if (excluded.some(ex => ex.contains(node))) continue;
            // clean against source ancestry, then transfer the exclusion/reveal
            // edits by applying them to the sanitized source clone in parallel.
            const mapping=new Map(),sanitized = clean(node, doc,false,mapping);
            originalNodes.forEach(original => {
                const target=mapping.get(original);
                if(target!==sanitized&&!sanitized.contains(target))return;
                if (excluded.some(ex => ex.contains(original))) target.remove();
                if (revealed.has(original)) {
                    target.removeAttribute('hidden'); target.removeAttribute('aria-hidden');
                    if (target.style?.display === 'none') target.style.removeProperty('display');
                    if (target.matches('details')) target.setAttribute('open', '');
                }
            });
            const section = doc.createElement('section'); section.dataset.role = region.role;
            if (region.role === 'title' && !sanitized.matches('h1,h2,h3,h4,h5,h6')) {
                const heading = doc.createElement('h1');
                for (const attribute of [...sanitized.attributes]) heading.setAttribute(attribute.name,attribute.value);
                while (sanitized.firstChild) heading.appendChild(sanitized.firstChild);
                section.appendChild(heading);
            } else section.appendChild(sanitized);
            wrapper.appendChild(section);
        }
        return wrapper;
    }
    function blockMetrics(root) {
        const metrics=new Map(),stack=[[root,false]];
        while(stack.length){const [node,visited]=stack.pop();
            if(!visited){stack.push([node,true]);for(let i=node.childNodes.length-1;i>=0;i--)stack.push([node.childNodes[i],false]);continue;}
            if(node.nodeType===3){metrics.set(node,{raw:node.nodeValue,protectedRaw:node.nodeValue,links:0});continue;}
            if(node.nodeType!==1){metrics.set(node,{raw:'',protectedRaw:'',links:0});continue;}
            const muted=node.matches('input,textarea,select,option,button,'+NOISE)&&node!==root;
            const children=[...node.childNodes].map(n=>metrics.get(n));
            const raw=muted?'':children.map(m=>m.raw).join(''),value=norm(raw);
            const protectedRaw=muted||node.matches(SIDEBAR)?'':children.map(m=>m.protectedRaw).join('');
            const links=muted?0:node.matches('a[href]')?value.length:children.reduce((s,m)=>s+m.links,0);
            metrics.set(node,{raw,protectedRaw,value,links});
        }
        return metrics;
    }
    function blocks(doc) {
        // Sanitize once, then measure subtrees without repeatedly cloning every
        // paragraph/list/table and each of its links (pathological on large specs).
        const mapping=new Map(),sanitizedBody=clean(doc.body,doc,true,mapping),metrics=blockMetrics(sanitizedBody);
        return matches(doc, SUBSTANTIVE).map(node => {
            const cached=metrics.get(mapping.get(node)),sanitized=cached?null:clean(node,doc);
            const value=cached?cached.value:text(sanitized),sidebar=!!node.closest(SIDEBAR);
            const protectedText=sidebar?'':cached?norm(cached.protectedRaw):nonSidebarText(sanitized);
            const density=cached?(value.length?Math.min(1,cached.links/value.length):0):linkDensity(sanitized);
            return {node,text:value,characters:value.length,linkDensity:density,sidebar,
                protectedText,protectedCharacters:protectedText.length};
        }).filter(b=>b.characters>=40 && b.linkDensity<0.5);
    }
    function inventory(pages, { mode = pages.length === 1 ? 'P3' : 'P4' } = {}) {
        const inventories = pages.map(doc => blocks(doc));
        const occurrences = new Map();
        for (const list of inventories) for (const value of new Set(list.map(b => b.text))) occurrences.set(value, (occurrences.get(value) || 0) + 1);
        // Repeat flags also apply to short non-substantive nodes in outlines.
        const repeatTexts = new Map();
        if (mode === 'P4') for (const doc of pages) {
            const sanitized = clean(doc.body, doc, true);
            all(sanitized, 'input,textarea,select,button').forEach(n => n.remove());
            for (const value of new Set(all(sanitized, '*').map(n => norm(n.textContent)).filter(t => t.length >= 20))) repeatTexts.set(value, (repeatTexts.get(value) || 0) + 1);
        }
        return inventories.map(list => list.map(b => ({ ...b, repeat: mode === 'P4' ? occurrences.get(b.text) : null,
            template: mode === 'P4' && occurrences.get(b.text) >= 2 }))).map((list, i) => ({ doc: pages[i], blocks: list,
                unique: list.filter(b => !b.template && !b.sidebar && b.protectedCharacters>=40),
                nonSidebar: list.filter(b=>!b.sidebar && b.protectedCharacters>=40),
                templates: list.filter(b => b.template), repeatTexts, mode }));
    }
    function coverage(list, output, {excludeSidebars=false}={}) {
        if(!list.length)return {ratio:1,characters:0,kept:0,total:0,missing:[]};
        // Text, not an output tag, establishes preservation. Collapse identical
        // ancestor/descendant matches so wrappers cannot invent extra copies.
        const clone=output.cloneNode(true);
        all(clone,'input,textarea,select,option,button,'+NOISE+(excludeSidebars?','+SIDEBAR:'')).forEach(n=>n.remove());
        const wanted=new Set(list.map(b=>excludeSidebars?b.protectedText:b.text)),counts=new Map(),values=new Map();
        const elements=all(clone,'*');
        for(const n of elements){const value=norm(n.textContent);values.set(n,value);if(!wanted.has(value))continue;
            let parent=n.parentElement,duplicate=false;for(;parent;parent=parent.parentElement)if(values.get(parent)===value){duplicate=true;break;}
            if(!duplicate)counts.set(value,(counts.get(value)||0)+1);
        }
        const kept = [], missing = [];
        const assigned=new Map();
        for (const b of list) {
            const value=excludeSidebars?b.protectedText:b.text,related=(assigned.get(value)||[]).some(other=>b.node&&other.node&&(b.node.contains(other.node)||other.node.contains(b.node)));
            const count = counts.get(value) || 0;
            if(related){kept.push(b);continue;}
            if(count){kept.push(b);counts.set(value,count-1);if(!assigned.has(value))assigned.set(value,[]);assigned.get(value).push(b);}else missing.push(b);
        }
        const weight=b=>excludeSidebars?b.protectedCharacters:b.characters;
        const characters = list.reduce((sum, b) => sum + weight(b), 0);
        return { ratio: characters ? kept.reduce((sum, b) => sum + weight(b), 0) / characters : 1,
            characters, kept: kept.length, total: list.length, missing };
    }
    function substantiveRatio(output) {
        const eligible = new Set(all(output, SUBSTANTIVE).filter(n => text(n).length >= 40 && linkDensity(n) < 0.5));
        // Union substantive subtrees so nested LI/P or BLOCKQUOTE/P text is
        // counted once, retaining whitespace across inline element boundaries.
        const roots = [...eligible].filter(node => {
            for (let p=node.parentElement;p;p=p.parentElement) if (eligible.has(p)) return false;
            return true;
        });
        const characters = roots.reduce((sum,node) => sum + text(node).length,0);
        return Math.min(1, characters / Math.max(1, text(output).length));
    }
    function baselineProtection(doc,inv,baselines) {
        if(!baselines || !['P0','P1'].every(k=>typeof baselines[k]?.html==='string'&&typeof baselines[k]?.ok==='boolean'))return null;
        const candidates=['P0','P1'].map(policy=>{
            const output=doc.createElement('div');output.innerHTML=baselines[policy].ok?baselines[policy].html:'';
            const kept=coverage(inv.unique,output,{excludeSidebars:true});
            return {policy,coverage:kept.ratio,kept:inv.unique.filter(b=>!kept.missing.includes(b)),ok:baselines[policy].ok};
        });
        candidates.sort((a,b)=>b.coverage-a.coverage||a.policy.localeCompare(b.policy));
        return {policy:candidates[0].policy,coverage:candidates[0].coverage,
            blocks:candidates[0].kept.filter(b=>!b.template&&!b.sidebar&&b.linkDensity<0.3&&b.characters>=40),
            baselines:candidates.map(b=>({policy:b.policy,coverage:b.coverage,ok:b.ok}))};
    }
    function pageVerdict(doc, rule, inv, { induction = true,baselines } = {}) {
        const schema = validate(rule, doc), reasons = [...schema.reasons];
        if (reasons.length) return { accepted: false, reasons, html: '' };
        reasons.push(...regionCounts(doc, rule));
        if (reasons.length) return { accepted: false, reasons, html: '' };
        const output = render(doc, rule), outputText = text(output);
        const h1 = matches(doc, 'h1').find(n => text(clean(n, doc)));
        if (h1 && !outputText.includes(text(clean(h1, doc)))) reasons.push('G2:h1-missing');
        const uniqueCoverage = coverage(inv.unique, output,{excludeSidebars:true}), templateCoverage = coverage(inv.templates, output);
        const sameInventory=inv.unique.length===inv.nonSidebar.length&&inv.unique.every((b,i)=>b===inv.nonSidebar[i]);
        const substantiveCoverage=sameInventory?uniqueCoverage:coverage(inv.nonSidebar,output,{excludeSidebars:true});
        let g6;
        if (induction) {
            if (uniqueCoverage.ratio < (inv.mode === 'P3' ? 0.8 : 0.9)) reasons.push('G3:unique-coverage');
            for (const exclusion of rule.exclude) {
                const removed = matches(doc, exclusion);
                const losesUnique = inv.unique.some(b => {
                    if(b.sidebar || b.linkDensity>=0.3 || b.characters<40)return false;
                    if (removed.some(n => n.contains(b.node))) return true;
                    if (!removed.some(n => b.node.contains(n))) return false;
                    // Descendant exclusions can remove part of the block too.
                    const original = all(b.node, '*'), copy = all(b.node.cloneNode(true), '*');
                    const trial = copy[0];
                    original.forEach((n, i) => { if (removed.includes(n) || isNoise(n)) copy[i].remove(); });
                    return nonSidebarText(trial) !== b.protectedText;
                });
                if (losesUnique) reasons.push('G4:unique-exclusion:' + exclusion);
            }
            const protection=baselineProtection(doc,inv,baselines);
            if(!protection)reasons.push('G6:baseline-evidence-required');
            else{
                const preservation=coverage(protection.blocks,output,{excludeSidebars:true});
                g6={baseline:protection.policy,baselineCoverage:protection.coverage,baselines:protection.baselines,
                    protected:protection.blocks.length,preserved:preservation.kept,missing:preservation.missing};
                if(preservation.missing.length)reasons.push('G6:baseline-regression');
            }
        }
        const substantiveNodes=new Set(inv.blocks.map(b=>b.node));
        const substantiveCharacters=inv.blocks.filter(b=>{for(let p=b.node.parentElement;p;p=p.parentElement)if(substantiveNodes.has(p))return false;return true;}).reduce((sum,b)=>sum+b.characters,0);
        const minimumTextLength=Math.min(200,0.5*substantiveCharacters);
        if (outputText.length < minimumTextLength) reasons.push('G5:output-too-short');
        return { accepted: !reasons.length, reasons, html: output.innerHTML, textLength: outputText.length,
            uniqueCoverage, templateCoverage, substantiveCoverage,substantiveCharacters,minimumTextLength,g6 };
    }
    function median(values) {
        const sorted = [...values].sort((a,b) => a-b), middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
    }
    function gate(pages, rule, options = {}) {
        if (!Array.isArray(pages) || !pages.length) return { accepted: false, reasons: ['G1:no-pages'], pages: [] };
        const inventories = options.inventories || inventory(pages, options);
        const verdicts = pages.map((doc, i) => {
            try { return pageVerdict(doc, rule, inventories[i],{baselines:options.baselines?.[i]}); }
            catch { return {accepted:false,reasons:['runtime-error'],html:''}; }
        });
        return { accepted: verdicts.every(v => v.accepted), reasons: verdicts.flatMap((v, i) => v.reasons.map(r => `p${i+1}:${r}`)), pages: verdicts,
            inductionMedianRatio: verdicts.every(v => Number.isFinite(v.substantiveRatio)) ? median(verdicts.map(v => v.substantiveRatio)) : null };
    }
    function useTime(doc, rule, induction) {
        let verdict;
        try { const inv = inventory([doc], { mode: 'P3' })[0]; verdict = pageVerdict(doc, rule, inv, { induction: false }); }
        catch { return {accepted:false,reasons:['runtime-error'],html:'',fallback:true}; }
        if (!validate(rule, doc).accepted) return { ...verdict, fallback: true };
        for (const anchor of rule.applicability.anchors) {
            const count = matches(doc, anchor.selector).length;
            if (count < anchor.min || count > anchor.max) verdict.reasons.push('applicability:anchor-count:' + anchor.selector);
        }
        if(verdict.substantiveCoverage && verdict.substantiveCoverage.ratio<0.6)verdict.reasons.push('use-time:substantive-coverage');
        verdict.accepted = !verdict.reasons.length;
        return { ...verdict, fallback: !verdict.accepted };
    }
    function selectFamily(doc,rules) {
        const matching=(Array.isArray(rules)?rules:[]).filter(rule=>validate(rule,doc).accepted&&rule.applicability.anchors.every(a=>{
            const count=matches(doc,a.selector).length;return count>=a.min&&count<=a.max;
        }));
        // More independent matching constraints first; stable input order breaks
        // ties. A selected rule failing use-time declines, without trial repairs.
        matching.sort((a,b)=>b.applicability.anchors.length-a.applicability.anchors.length);
        if(!matching.length)return {accepted:false,fallback:true,reasons:['family:no-matching-anchors'],html:'',rule:null};
        const rule=matching[0],verdict=useTime(doc,rule);
        return {...verdict,rule,matchingFamilies:matching.length};
    }
    return { NOISE, SUBSTANTIVE, SIDEBAR, ROLES, norm,hostnameKey, clean,srcsetCandidates,text, nonSidebarText,matches, linkDensity, validSelector,identityAnchor, validate, render, blocks, inventory, coverage, substantiveRatio,baselineProtection,gate,useTime,selectFamily };
});
