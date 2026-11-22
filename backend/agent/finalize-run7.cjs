'use strict';
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./ledger.cjs'),agent=require('./capability-run.cjs');
function finalize(){
 const pointer=JSON.parse(fs.readFileSync('workspace/revision/dev-runs/run7/resume.json')),
 context=JSON.parse(fs.readFileSync(pointer.contextFile)),best=JSON.parse(fs.readFileSync(pointer.iterationFile));
 const archive=path.join(context.directory,'iteration-3/source-snapshot');
 fs.copyFileSync('tests/revision/agent/catalog.test.cjs',path.join(archive,'catalog.test.cjs'),fs.constants.COPYFILE_EXCL);
 for(const file of ['outline.cjs','catalog.cjs'])fs.copyFileSync(path.join(best.folder,'source-snapshot',file),path.join('backend/agent',file));
 if(hash(fs.readFileSync('backend/agent/outline.cjs'))!==best.viewsHash)throw Error('selected-view-source-mismatch');
 if(hash(fs.readFileSync('extension/procedure-v3.js'))!==best.gateHash)throw Error('selected-gate-source-mismatch');
 // Retire the integration test of the discarded view feature together with its
 // archived source; all selector-catalog and gate regression tests remain live.
 let tests=fs.readFileSync('tests/revision/agent/catalog.test.cjs','utf8');
 const start=tests.indexOf("test('views mark title-bearing"),end=tests.indexOf('\ntest(',start+1);
 if(start<0||end<0)throw Error('experimental-test-boundary-not-found');
 tests=tests.slice(0,start)+tests.slice(end+1);
 tests=tests.replace("const {rule}=require('./helpers.cjs');\n",'');
 fs.writeFileSync('tests/revision/agent/catalog.test.cjs',tests);
 const finalContext={...context,tuningDevCap:670,finalRun:true,selectedIteration:2,tuningStopReason:'two-consecutive-non-improving-iterations'};
 const contextFile=path.join(context.directory,'context-final.json');
 fs.writeFileSync(contextFile,JSON.stringify(finalContext,null,2),{flag:'wx'});
 const state=agent.iteration(finalContext,4,fs.readFileSync('workspace/revision/dev-runs/run7/iteration2-guidance.txt','utf8'));
 if(state.promptHash!==best.promptHash)throw Error('final-prompt-not-selected-prompt');
 const rows=fs.readFileSync(path.join(best.output,'rows.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.policy==='P4-off');
 if(rows.length!==36)throw Error('incomplete-selected-policy');
 for(const row of rows){
  const target=path.join(state.output,row.outputFile);
  fs.copyFileSync(path.join(best.output,row.outputFile),target,fs.constants.COPYFILE_EXCL);
  if(hash(fs.readFileSync(target))!==row.outputSha256)throw Error('carry-forward-hash');
  fs.appendFileSync(path.join(state.output,'rows.jsonl'),JSON.stringify({...row,originalIteration:row.iteration,iteration:4,
   originalViewsHash:row.viewsHash,viewsHash:state.viewsHash,carriedFrom:best.output})+'\n');
 }
 const receipt={contextFile,iterationFile:path.join(state.folder,'iteration.json'),selectedIteration:2,
  carriedRows:rows.length,viewsSourceVerified:true,promptHash:state.promptHash};
 fs.writeFileSync('workspace/revision/dev-runs/run7/final.json',JSON.stringify(receipt,null,2),{flag:'wx'});
 console.log(JSON.stringify({...receipt,output:state.output,viewsHash:state.viewsHash}));
}
if(require.main===module)finalize();
module.exports={finalize};
