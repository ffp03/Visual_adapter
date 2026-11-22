'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
const ROOT=path.resolve(__dirname,'../../..'),DEV=path.join(ROOT,'workspace/revision/corpus/dev'),ARCH=path.join(ROOT,'workspace/revision/corpus/archive/dev-references-2026-11-21');
const replaced=new Set(['dev-07-p2','dev-08-p1','dev-08-p2','dev-08-p3','dev-08-p4','dev-08-p5']);
async function walk(d){let a=[];for(const e of await fs.readdir(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())a.push(...await walk(f));else if(e.name==='reference.json')a.push(f)}return a}
function units(r){return ['content','noise','neutral'].flatMap(s=>(r[s]||[]).map(u=>[`${s}/${u.id}`,u.text]))}
async function main(){for(const f of (await walk(DEV)).sort()){const id=path.basename(path.dirname(f)),cur=JSON.parse(await fs.readFile(f,'utf8'));if(replaced.has(id)){console.log(`${id}\tfresh ref\t${cur.content.length}/${cur.noise.length}/${cur.neutral.length} content/noise/neutral`);continue}const old=JSON.parse(await fs.readFile(path.join(ARCH,id+'.json'),'utf8')),a=new Map(units(old)),b=new Map(units(cur));let changed=0,removed=0,added=0;for(const[k,v]of a){if(!b.has(k))removed++;else if(b.get(k)!==v)changed++}for(const k of b.keys())if(!a.has(k))added++;console.log(`${id}\tchanged ${changed}\tremoved ${removed}\tadded ${added}`)}}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
