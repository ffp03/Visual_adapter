'use strict';
const fs=require('node:fs'),path=require('node:path');const {hash}=require('./ledger.cjs');
const ROOT=path.resolve(__dirname,'../..'),DEST=path.join(ROOT,'workspace/revision/dev-runs');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('refusing-evidence-symlink');return e.isDirectory()?files(p):[p];});}
function migrate(){
 fs.mkdirSync(DEST,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const source=path.resolve(__dirname,'workspace'),target=path.join(DEST,'archive','run1-generated-'+stamp);
 const codeArchive=path.join(DEST,'archive','run1-code-'+stamp);fs.mkdirSync(codeArchive,{recursive:true});
 const codes=[path.join(ROOT,'extension/procedure-v3.js'),...files(__dirname).filter(f=>!f.startsWith(source+path.sep)&&/\.(cjs|md|js)$/.test(f)),...files(path.join(ROOT,'tests/revision/agent'))];
 const archived=[];for(const f of codes){const relative=path.relative(ROOT,f),to=path.join(codeArchive,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to,fs.constants.COPYFILE_EXCL);archived.push({old:relative,archive:path.relative(ROOT,to),sha256:hash(fs.readFileSync(f))});}
 const moves=[];
 if(fs.existsSync(source)){
  if(!source.startsWith(path.join(ROOT,'backend')+path.sep)||!target.startsWith(path.join(ROOT,'workspace/revision/dev-runs')+path.sep))throw Error('unsafe-move-target');
  const before=files(source).map(f=>({relative:path.relative(source,f),sha256:hash(fs.readFileSync(f))}));
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.renameSync(source,target);
  for(const f of before){const to=path.join(target,f.relative);if(hash(fs.readFileSync(to))!==f.sha256)throw Error('move-hash-mismatch');moves.push({old:path.relative(ROOT,path.join(source,f.relative)),new:path.relative(ROOT,to),sha256:f.sha256});}
 }
 const receipt=path.join(DEST,'migration-'+stamp+'.json');fs.writeFileSync(receipt,JSON.stringify({at:new Date().toISOString(),archived,moves},null,2),{flag:'wx'});
 console.log(JSON.stringify({archivedFiles:archived.length,movedFiles:moves.length,receipt}));
}
if(require.main===module)migrate();module.exports={migrate};
