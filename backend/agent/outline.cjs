'use strict';
const v3 = require('../../extension/procedure-v3.js');
const {synchronous}=require('./baselines.cjs');

const {redact}=require('./privacy.cjs');
const observed=require('./catalog.cjs');

class Views {
    constructor(pages, { cueLength = 60, mode = pages.length === 1 ? 'P3' : 'P4',baselines,check = 'gate' } = {}) {
        if (![0,60,'full'].includes(cueLength)) throw Error('cue-length-must-be-0-60-or-full');
        this.pages = pages; this.cueLength = cueLength; this.mode = mode; this.check = check;
        this.inventories = v3.inventory(pages, { mode });
        this.baselines=baselines||synchronous(pages);this.precisionCache=new Map();
        this.maps = pages.map(doc => {
            const elements = [doc.body, ...doc.body.querySelectorAll('*')];
            const ids = new Map(elements.map((n, i) => [n, 'n' + (i+1)]));
            const nodes = new Map(elements.map(n => [ids.get(n), n]));
            const allowed = new Set(v3.matches(doc, '*'));
            const sanitized=new Map(),clean=v3.clean(doc.body,doc,true,sanitized);
            // Remove form values in their entirety, including options and labels
            // represented by interactive buttons. No value attributes are emitted.
            clean.querySelectorAll('input,textarea,select,button').forEach(n => { n.textContent = ''; n.removeAttribute('value'); });
            const stats = new Map();
            const measure = node => {
                if (!stats.has(node)) {
                    const copy = sanitized.get(node), value = copy && !node.closest('input,textarea,select,button') ? v3.norm(copy.textContent) : '';
                    const total = value.length;
                    const linkText = copy ? [...copy.querySelectorAll('a[href]')].reduce((sum, n) => sum + v3.norm(n.textContent).length, 0) : 0;
                    const density = node.matches('a[href]') ? (total ? 1 : 0) : (total ? Math.min(1,linkText / total) : 0);
                    stats.set(node, { text: value, characters: total, linkDensity: density,
                        repeat: mode === 'P4' && value.length >= 20 ? this.inventories[0].repeatTexts.get(value) || 1 : null });
                }
                return stats.get(node);
            };
            return { ids, nodes, allowed, measure };
        });
    }
    selectorHints(node){
        const tag=node.tagName.toLowerCase(),hints=[];
        if(node.id)hints.push(tag+'[id='+JSON.stringify(node.id)+']');
        const classes=[...node.classList].slice(0,5);
        for(const c of classes)hints.push(tag+'[class~='+JSON.stringify(c)+']');
        if(classes.length>1)hints.push(tag+classes.slice(0,3).map(c=>'[class~='+JSON.stringify(c)+']').join(''));
        for(const attr of ['role','itemprop','data-component','data-testid','aria-label'])if(node.getAttribute(attr))hints.push(tag+'['+attr+'='+JSON.stringify(node.getAttribute(attr))+']');
        return hints.filter(s=>s.length<=300&&redact(s)===s);
    }
    disambiguate(selector){
        if(this.precisionCache.has(selector))return this.precisionCache.get(selector);
        if(this.pages.some(d=>!v3.validSelector(selector,d)))return [];
        const sets=this.pages.map(d=>v3.matches(d,selector)),candidates=[],targets=new Set();
        for(const node of sets[0].slice(0,24)){
            const local=this.selectorHints(node),choices=[...local];
            for(let parent=node.parentElement,depth=0;parent&&depth<2;parent=parent.parentElement,depth++){
                for(const p of this.selectorHints(parent).slice(0,2))for(const child of [node.tagName.toLowerCase(),...local.slice(0,2)])choices.push(p+(depth===0?' > ':' ')+child);
            }
            for(const candidate of choices){
                if(!v3.validSelector(candidate,this.pages[0])||candidate===selector)continue;
                const resolved=this.pages.map(d=>v3.matches(d,candidate));
                if(resolved.some((ns,i)=>ns.length!==1||!sets[i].includes(ns[0]))||targets.has(resolved[0][0]))continue;
                targets.add(resolved[0][0]);candidates.push({selector:candidate,nodes:resolved.map((ns,i)=>this.maps[i].ids.get(ns[0]))});break;
            }
            if(candidates.length===3)break;
        }
        this.precisionCache.set(selector,candidates);return candidates;
    }
    baselineView(index,budget){
        const doc=this.pages[index],inv=this.inventories[index];
        return Object.fromEntries(['P0','P1'].map(policy=>{
            const b=this.baselines[index][policy],out=doc.createElement('div');out.innerHTML=b.ok?b.html:'';
            const covered=v3.coverage(inv.nonSidebar,out,{excludeSidebars:true}),kept=inv.nonSidebar.filter(n=>!covered.missing.includes(n));
            let common=kept[0]?.node;
            while(common&&!kept.every(n=>common.contains(n.node)))common=common.parentElement;
            const direct=[...out.children].filter(n=>!n.id||!!doc.getElementById(n.id)).flatMap(n=>this.selectorHints(n)).filter(s=>v3.validSelector(s,doc)&&v3.matches(doc,s).length===1);
            while(common&&!this.selectorHints(common).length&&!['MAIN','ARTICLE','BODY'].includes(common.tagName))common=common.parentElement;
            const sourceContainers=direct.length?direct.slice(0,3):common?this.selectorHints(common).slice(0,2):[];
            if(common&&['MAIN','ARTICLE','BODY'].includes(common.tagName)&&!sourceContainers.length)sourceContainers.push(common.tagName.toLowerCase());
            const blocks=[...out.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,dd,pre,blockquote,figcaption,img,table')].slice(0,40).map(n=>{
                const text=v3.text(n),record={tag:n.tagName.toLowerCase(),textLength:text.length,linkDensity:Number(v3.linkDensity(n).toFixed(3)),cue:this.cue(text,budget)};
                if(this.mode==='P4')record.repeat=text.length>=20?`${inv.repeatTexts.get(text)||1}/${this.pages.length}`:null;
                return record;
            });
            return [policy,{ok:b.ok,reason:b.ok?null:redact(b.reason||'baseline-failed'),sourceContainers,containerInference:direct.length?'observed-output-root':'least-common-ancestor-of-preserved-substantive-blocks',
                outputWrappers:[...out.children].map(n=>redact(n.tagName.toLowerCase()+(n.id?'#'+n.id:''))).slice(0,5),substantiveCoverage:covered.ratio,output:blocks}];
        }));
    }
    suspicions(index,output,budget){
        const map=this.maps[index],outputText=v3.text(output),candidates=[];
        const tokenPattern=/(?:^|[-_\s])(share|social|related|recommend(?:ed)?|promo|ad|advertisement|newsletter|subscribe|cookie|comment-form|breadcrumb|footer)(?:$|[-_\s])/i;
        for(const node of map.allowed){
            if(!map.ids.has(node))continue;
            const s=map.measure(node);if(!s.text||!outputText.includes(s.text))continue;
            const token=((node.id||'')+' '+node.className).replace(/([a-z])([A-Z])/g,'$1-$2'),matched=token.match(tokenPattern),reasons=[];
            if(this.mode==='P4'&&s.repeat>=2)reasons.push('repeat');
            if(s.linkDensity>=0.5)reasons.push('high-link-density');
            if(matched)reasons.push('token:'+matched[1].toLowerCase());
            if(reasons.length)candidates.push({node,reasons});
        }
        const kept=candidates.filter(c=>!candidates.some(parent=>parent.node!==c.node&&parent.node.contains(c.node))).slice(0,40)
            .map(c=>({node:map.ids.get(c.node),selectors:this.selectorHints(c.node).slice(0,2),reasons:c.reasons,cue:this.cue(map.measure(c.node).text,budget)}));
        const missing=v3.coverage(this.inventories[index].nonSidebar,output,{excludeSidebars:true}).missing;
        return {keptBoilerplate:kept,droppedContent:missing.slice(0,40).map(b=>({node:map.ids.get(b.node),selectors:this.selectorHints(b.node).slice(0,2),characters:b.protectedCharacters,cue:this.cue(b.protectedText,budget)})),droppedContentCount:missing.length};
    }
    cue(value, budget) {
        if (this.cueLength === 0) return '';
        const redacted = redact(value), length = this.cueLength === 'full' ? redacted.length : this.cueLength;
        const cue = redacted.slice(0, Math.max(0, Math.min(length, budget.remaining)));
        budget.remaining -= cue.length; return cue;
    }
    summary(page, node, budget = { remaining: 12000 }) {
        const map = this.maps[page], stats = map.measure(node);
        const descriptor = node.tagName.toLowerCase() + (node.id ? '#' + node.id : '')
            + [...node.classList].map(c => '.' + c).join('') + (node.getAttribute('role') ? '[' + node.getAttribute('role') + ']' : '');
        const result = { id: map.ids.get(node), descriptor: redact(descriptor), children: [...node.children].filter(n => map.allowed.has(n)).length,
            textLength: stats.characters, linkDensity: Number(stats.linkDensity.toFixed(3)), sidebar:!!node.closest(v3.SIDEBAR),cue: this.cue(stats.text, budget) };
        if (this.mode === 'P4') result.repeat = stats.repeat === null ? null : `${stats.repeat}/${this.pages.length}`;
        return result;
    }
    outline(page = 1, node, depth = 2, maxCharacters = 8000,cueBudget) {
        if (!Number.isInteger(page) || page < 1 || page > this.pages.length) throw Error('invalid-page');
        if (!Number.isInteger(depth) || depth < 0 || depth > 20) throw Error('invalid-outline-depth');
        const index = page-1, map = this.maps[index], root = node ? map.nodes.get(node) : this.pages[index].body;
        if (!root || !map.allowed.has(root)) throw Error('unknown-node');
        const lines = [], budget = cueBudget||{ remaining: 12000 }; let used = 0, truncated = false;
        const walk = (current, level) => {
            if (truncated || !map.allowed.has(current)) return;
            const s = this.summary(index, current, budget);
            const line = '  '.repeat(level) + `[${s.id}] ${s.descriptor} children=${s.children} text=${s.textLength} links=${s.linkDensity}`
                + ` sidebar=${s.sidebar}`
                + (this.mode === 'P4' ? ` repeat=${s.repeat || '-'}` : '') + (s.cue ? ' ' + JSON.stringify(s.cue) : '')
                + (level === depth && s.children ? ' [collapsed]' : '');
            if (used + line.length + 1 > maxCharacters - 24) { truncated = true; return; }
            lines.push(line); used += line.length + 1;
            if (level < depth) for (const child of current.children) walk(child, level+1);
        };
        walk(root,0);
        if (truncated) lines.push('[outline truncated]');
        return { page, root: map.ids.get(root), outline: lines.join('\n'), truncated };
    }
    query(selector) {
        return this.pages.map((doc, page) => {
            if (!v3.validSelector(selector, doc)) return { page: page+1, error: 'invalid-selector' };
            const nodes = v3.matches(doc, selector), budget = { remaining: 12000 };
            return { page: page+1, count: nodes.length, matches: nodes.slice(0,5).map(n => this.summary(page, n, budget)),
                disambiguatingSelectors:nodes.length>1?this.disambiguate(selector):[],
                observedAlternatives:nodes.length===0?observed.alternatives(this,page,selector):[] };
        });
    }
    preview(rule) {
        const verdict = v3.gate(this.pages, rule, { inventories: this.inventories,baselines:this.baselines,check:this.check });
        return { accepted: verdict.accepted, reasons: verdict.reasons.map(redact), inductionMedianRatio: verdict.inductionMedianRatio,
            ...(verdict.advisory ? { check: verdict.check, advisory: verdict.advisory.map(redact) } : {}),
            pages: verdict.pages.map((v, i) => {
                const budget = { remaining: 12000 };
                const output = this.pages[i].createElement('div'); output.innerHTML = v.html || '';
                const precision=(Array.isArray(rule?.regions)?rule.regions:[]).flatMap((r,region)=>{
                    if(r.multiple||!v3.validSelector(r.selector,this.pages[i]))return [];
                    const count=v3.matches(this.pages[i],r.selector).length;
                    return count===1?[]:[{region,count,selector:redact(r.selector),candidates:count>1?this.disambiguate(r.selector):[],observedAlternatives:count===0?observed.alternatives(this,i,r.selector):[]}];
                });
                const g6=v.g6?{...v.g6,missing:v.g6.missing.slice(0,40).map(b=>({node:this.maps[i].ids.get(b.node),characters:b.protectedCharacters,cue:this.cue(b.protectedText,budget)}))}:null;
                const suspicion=this.suspicions(i,output,budget);
                return { page: i+1, accepted: v.accepted, reasons: v.reasons.map(redact), textLength: v.textLength || 0,
                    ...(v.advisory ? { advisory: v.advisory.map(redact) } : {}),
                    g6,precision,suspicion,
                    uniqueCoverage: v.uniqueCoverage?.ratio ?? null,
                    substantiveCoverage:v.substantiveCoverage?.ratio??null,minimumTextLength:v.minimumTextLength??null,
                    templateBlocksRetained: v.templateCoverage?.kept ?? 0,
                    missingUnique: (v.uniqueCoverage?.missing || []).slice(0,40).map(b => ({ node: this.maps[i].ids.get(b.node), characters: b.characters, cue: this.cue(b.protectedText, budget) })),
                    output: [...output.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,dd,pre,blockquote,figcaption,img,table')].slice(0,40)
                        .map(n => ({ tag: n.tagName.toLowerCase(), textLength: v3.text(n).length, cue: this.cue(v3.text(n), budget) })) };
            }) };
    }
    initial() { return this.pages.map((_, i) => {const budget={remaining:12000},outline=this.outline(i+1,undefined,4,8000,budget),baselines=this.baselineView(i,budget);
        return {...outline,baselines,sourceSelectors:observed.catalog(this,i,baselines,budget)};}); }
}
module.exports = { redact, Views, createViews: (pages, options) => new Views(pages, options) };
