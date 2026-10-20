// Independent completeness guard for the frozen study. Does not alter study artifacts.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=b=>createHash('sha256').update(b).digest('hex');
function audit(root,base){
 const file=path.join(base,'harness-freeze.json'),freeze=JSON.parse(fs.readFileSync(file));
 const canonical=f=>f.replace(/\\/g,'/'),bound=Object.fromEntries(Object.entries(freeze.files).map(([f,h])=>[canonical(f),h])),expected=new Set(['tests/local/holdout.cjs','tests/local/experiment-lock.cjs',...Object.keys(bound)]),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 const rows=(manifest.dispositions||[]).flatMap(s=>[s.discovery,...(s.pages||[]),...(s.previousPages||[])]).concat(manifest.pages||[]).filter(Boolean);
 for(const p of rows)if(p.sha256)for(const name of ['source.html','capture.json',...(p.referenceSha256||p.status>=200&&p.status<300?['references.json']:[])])expected.add(canonical(path.relative(root,path.join(base,p.id,name))));
 for(const d of fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^site/.test(d.name)))for(const name of['source.html','references.json','capture.json']){const f=path.join(base,d.name,name);if(fs.existsSync(f))expected.add(canonical(path.relative(root,f)));}
 for(const f of expected){if(!Object.hasOwn(bound,f))throw Error('Freeze entry missing: '+f);if(hash(fs.readFileSync(path.join(root,f)))!==bound[f])throw Error('Freeze content changed: '+f);}
 const manifestHash=hash(fs.readFileSync(path.join(base,'manifest.json')));if(freeze.manifestSha256&&manifestHash!==freeze.manifestSha256)throw Error('Manifest changed');
 return{complete:true,expectedFiles:expected.size,freezeSha256:hash(fs.readFileSync(file)),manifestSha256:manifestHash};
}
module.exports={audit};
if(require.main===module){const root=path.resolve(__dirname,'../..'),base=path.join(root,'workspace/task023/holdout-20261019');console.log(JSON.stringify(audit(root,base)));}
