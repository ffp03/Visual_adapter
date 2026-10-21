const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const prep=require('./study-preparation.cjs');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'workspace/task023/refresh-20261021/study-preparation-v1');
fs.mkdirSync(base,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pages=['a','b'].map((part,index)=>({id:'books-product-'+part,site:'old-books',url:'https://books.toscrape.com/catalogue/'+(index?'a-light-in-the-attic_1000':'soumission_998')+'/index.html',sourceFile:'workspace/task023/live-20261019/books-product-'+part+'/source.html',referenceFile:'workspace/task023/development-metric-audit/references/books-product-'+part+'.json',seedId:'books-product-a'}));
test('normalized explicit manifests reject duplicate IDs, nonfirst seeds and unsafe paths',()=>{
    const manifest={schemaVersion:1,scope:'development-final',pages};
    assert.equal(prep.normalize(manifest).pages.length,2);
    assert.throws(()=>prep.normalize({...manifest,pages:[pages[0],pages[0]]}),/identity/);
    assert.throws(()=>prep.normalize({...manifest,pages:[{...pages[0],seedId:pages[1].id},pages[1]]}),/first explicit/);
    assert.throws(()=>prep.normalize({...manifest,pages:[{...pages[0],sourceFile:'C:/Windows/win.ini'}]}),/outside/);
});
test('two old development pages prepare exact frozen requests and score three policies with unchanged seed transfer',{timeout:360000},()=>{
    const run=fs.mkdtempSync(path.join(base,'old-books-')),manifestFile=path.join(run,'input.json'),folder=path.join(run,'prepared');
    // Capture original URLs from the existing allowed development metadata only.
    const oldManifest=JSON.parse(fs.readFileSync(path.join(root,'workspace/task023/development-metric-audit/frozen-manifest.json'),'utf8'));
    for(const entry of pages)entry.url=oldManifest.pages.find(page=>page.id===entry.id).url;
    fs.writeFileSync(manifestFile,JSON.stringify({schemaVersion:1,scope:'development-final',pages},null,2));
    const prepared=prep.prepare(manifestFile,folder);assert.equal(prepared.pages,2);assert.equal(prepared.eligible,2);assert.equal(prepared.excluded.length,0);
    const plan=JSON.parse(fs.readFileSync(path.join(folder,'study-plan.json')));assert.equal(plan.records.length,2);
    const {modelInputText}=require('../../backend/model-evidence.cjs');
    for(const entry of pages){const pageFolder=path.join(folder,entry.id),args=JSON.parse(fs.readFileSync(path.join(pageFolder,'arguments.json'))),request=JSON.parse(fs.readFileSync(path.join(pageFolder,'prepared-request.json'))),metadata=JSON.parse(fs.readFileSync(path.join(pageFolder,'metadata.json')));
        assert.equal(request.messages[1].content,modelInputText(args.html,args.evidence));assert(request.messages[1].content.length<=12000);
        assert.deepEqual(Object.keys(args).sort(),['evidence','html']);assert.equal(metadata.providerCalls,0);assert.equal(metadata.externalNetworkRequests,0);assert.equal(metadata.validationComplete,true);assert(metadata.sampling.modelCharacters<=12000);
        const job=JSON.parse(fs.readFileSync(path.join(pageFolder,'owned-job.json')));assert.equal(job.cleanup.activeProcesses,0);assert.equal(job.exitCode,0);
    }
    assert.throws(()=>prep.prepare(manifestFile,folder),/already exists/);
    const records=pages.map(entry=>{const file=path.join(root,'workspace/task023/live-20261019',entry.id,'provider-rule.json');return{id:entry.id,candidateFile:path.relative(root,file),candidateSha256:hash(file)}});
    const candidateFile=path.join(run,'old-candidates.json');fs.writeFileSync(candidateFile,JSON.stringify({schemaVersion:1,provenance:'retained-development-check',records},null,2));
    const scoring=path.join(run,'scoring');assert.deepEqual(prep.score(folder,candidateFile,scoring,hash(path.join(folder,'study-plan.json'))),{pages:2,rows:6});
    const result=JSON.parse(fs.readFileSync(path.join(scoring,'summary.json')));assert.equal(result.rows.length,6);assert.equal(result.timingClaim,false);assert.equal(result.providerCalls,0);
    const shared=result.rows.filter(row=>row.approach==='compiled-shared');assert(shared[0].procedureSha256);assert.equal(shared[0].procedureSha256,shared[1].procedureSha256);assert.equal(shared[0].compilation.id,'books-product-a');assert.equal(shared[1].compilation.id,'books-product-a');
    for(const row of result.rows){assert.equal(row.measurementComplete,true);assert.equal(row.providerCalls,0);assert.equal(row.score.noFallbackPass,row.score.complete===true&&row.delivery.noFallback===true&&row.delivery.ruleApplied===true&&row.delivery.procedureDelivered===true)}
    for(const entry of pages){const job=JSON.parse(fs.readFileSync(path.join(scoring,entry.id,'owned-job.json')));assert.equal(job.cleanup.activeProcesses,0);}
    const snapshot=path.join(folder,'strict-scorer.js');fs.copyFileSync(snapshot,path.join(run,'strict-scorer-before-tamper.js'));fs.appendFileSync(snapshot,'\n');assert.throws(()=>prep.verify(folder),/binding changed/);
});
function provenanceFixture(){
    const folder=fs.mkdtempSync(path.join(base,'provenance-')),ledger=path.join(folder,'fake-ledger');fs.mkdirSync(ledger);fs.mkdirSync(path.join(ledger,'events'));
    const entries=[{id:'a',site:1,seedId:'a'},{id:'b',site:1,seedId:'a'}],manifest={schemaVersion:1,scope:'development-final',pages:entries},inputs={},records=[];
    for(const entry of entries){const dir=path.join(folder,entry.id);fs.mkdirSync(dir);for(const[name,value]of[['metadata.json',{generationEligible:true}],['validation-context.json',{validationComplete:true}]]){const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(value));inputs[path.relative(root,file).replaceAll('\\','/')]=hash(file);}const requestFile=path.join(dir,'request.json'),argumentsFile=path.join(dir,'arguments.json');fs.writeFileSync(requestFile,JSON.stringify({synthetic:entry.id}));fs.writeFileSync(argumentsFile,'{}');records.push({id:manifest.scope+'-'+entry.id,requestFile,requestSha256:hash(requestFile),argumentsFile,argumentsSha256:hash(argumentsFile)});}
    fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(folder,'freeze.json'),'{}');
    const plan={schemaVersion:1,scope:manifest.scope,records,bindings:{inputs}};fs.writeFileSync(path.join(folder,'study-plan.json'),JSON.stringify(plan));const planSha256=hash(path.join(folder,'study-plan.json'));
    const summary={planSha256,freezeSha256:hash(path.join(folder,'freeze.json'))};fs.writeFileSync(path.join(folder,'preparation-summary.json'),JSON.stringify(summary));fs.writeFileSync(path.join(folder,'preparation-summary.sha256'),hash(path.join(folder,'preparation-summary.json')));
    const candidates=[];for(let i=0;i<entries.length;i++){const record=records[i],dir=path.join(ledger,record.id);fs.mkdirSync(dir);const candidateFile=path.join(dir,'provider-result.json');fs.writeFileSync(candidateFile,JSON.stringify({rule:{main:'main',name:entries[i].id,exclude:[]}}));const reservation={id:record.id,sequence:i+1,scope:plan.scope,planSha256,requestFileSha256:record.requestSha256,wireRequestSha256:createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(record.requestFile)))).digest('hex')};fs.writeFileSync(path.join(ledger,'events',String(i+1).padStart(3,'0')+'-a-reserved.json'),JSON.stringify(reservation));const outcomeFile=path.join(ledger,'events',String(i+1).padStart(3,'0')+'-b-outcome.json');fs.writeFileSync(outcomeFile,JSON.stringify({id:record.id,success:true,resultSha256:hash(candidateFile)}));candidates.push({id:entries[i].id,attemptId:record.id,candidateFile,candidateSha256:hash(candidateFile),outcomeFile,outcomeSha256:hash(outcomeFile)});}
    return{folder,ledger,entries,candidates,planSha256};
}
test('canonical candidate receipt cannot be swapped between prepared pages or requests',()=>{
    const f=provenanceFixture(),prepared=prep.preparedBindings(f.folder,undefined,f.planSha256);
    prep.authenticateStudyCandidate(prepared,f.entries[0],f.candidates[0],f.ledger);
    assert.throws(()=>prep.authenticateStudyCandidate(prepared,f.entries[0],{...f.candidates[1],id:'a'},f.ledger),/another prepared page/);
    assert.throws(()=>prep.authenticateStudyCandidate(prepared,f.entries[0],{...f.candidates[1],id:'a',attemptId:f.candidates[0].attemptId},f.ledger),/another prepared page/);
    const file=path.join(f.ledger,'events/001-a-reserved.json'),reservation=JSON.parse(fs.readFileSync(file));reservation.wireRequestSha256='0'.repeat(64);fs.writeFileSync(file,JSON.stringify(reservation));assert.throws(()=>prep.authenticateStudyCandidate(prepared,f.entries[0],f.candidates[0],f.ledger),/request mismatch/);
});
test('eligibility and validation tampering fail before use; expected plan hash anchors summary',()=>{
    for(const name of['metadata.json','validation-context.json']){const f=provenanceFixture();prep.preparedBindings(f.folder,undefined,f.planSha256);fs.appendFileSync(path.join(f.folder,'b',name),' ');assert.throws(()=>prep.preparedBindings(f.folder,undefined,f.planSha256),/binding changed/);}
    const f=provenanceFixture();assert.throws(()=>prep.preparedBindings(f.folder,undefined,'0'.repeat(64)),/root changed/);
});
test('shared local procedure survives generation transport ineligibility without enabling a fresh candidate',()=>{
    const procedure={schemaVersion:2,regions:[{selector:'main'}]},compilation={procedure};
    assert.equal(prep.policyProcedure('compiled-shared',compilation,false),procedure);
    assert.equal(prep.policyProcedure('compiled-fresh',compilation,false),null);
    assert.equal(prep.policyProcedure('fallback',null,false),null);
});
test('retained provenance is development-only and unseen rejects before candidate or preparation reads',()=>{
    const f=provenanceFixture(),manifestFile=path.join(f.folder,'retained-candidates.json');
    const payload={schemaVersion:1,provenance:'retained-development-check',records:f.candidates};
    fs.writeFileSync(manifestFile,JSON.stringify(payload));
    const accepted=prep.candidatesFor(manifestFile,{scope:'development-final',pages:f.entries},f.folder,f.planSha256);
    assert.equal(accepted.size,2);assert.equal(accepted.provenance,'retained-development-check');assert.equal(accepted.get('a').provenance,'retained-development-check');
    const poison=path.join(f.folder,'unseen-retained.json');fs.writeFileSync(poison,JSON.stringify({...payload,records:[{id:'a',candidateFile:'DOES_NOT_EXIST',candidateSha256:'0'.repeat(64)}]}));
    assert.throws(()=>prep.candidatesFor(poison,{scope:'unseen-final',pages:f.entries},path.join(f.folder,'NO_PREPARATION'),'0'.repeat(64)),/Retained provenance is restricted to development-final/);
});
test('bounded cleanup and explicit CLI completion publish all files despite lingering handles',()=>{
    const {spawnSync}=require('node:child_process'),folder=fs.mkdtempSync(path.join(base,'cleanup-'));
    const script=path.join(folder,'controlled-cleanup.cjs');
    fs.writeFileSync(script,`const fs=require('node:fs'),path=require('node:path'),api=require(${JSON.stringify(path.join(__dirname,'study-preparation.cjs'))});setInterval(()=>{},1000);(async()=>{let calls=0;const hanging={close(){calls++;return new Promise(()=>{})}};await api.boundedClose(hanging,'page');await api.boundedClose(hanging,'browser');for(const name of ['metadata.json','plan.json','rows.json','summary.json'])fs.writeFileSync(path.join(__dirname,name),JSON.stringify({published:true}));api.completeCLI({complete:true,calls})})().catch(api.failCLI);`);
    const result=spawnSync(process.execPath,[script],{timeout:20000,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);
    const lines=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
    assert.equal(lines.filter(value=>value.status==='timed-out').length,2);assert.equal(lines.at(-1).calls,2);
    for(const name of ['metadata.json','plan.json','rows.json','summary.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(folder,name))).published,true);
    const failure=spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'study-preparation.cjs'))}).failCLI(new Error('controlled failure'))`],{timeout:10000,encoding:'utf8',windowsHide:true});assert.equal(failure.status,1);assert.match(failure.stderr,/controlled failure/);
});
