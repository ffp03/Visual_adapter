// Explicit saved-source adapter. No discovery, acquisition, credentials or live fetches.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const NODE = 'C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';
const PYTHON = path.join(ROOT, '.venv/Scripts/python.exe');
const PW = 'C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const CHROME = 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe';
const SCORER = 'workspace/task023/refresh-20261021/retained-regression-v4/strict-scorer.js';
const SCORER_SHA = '76282ffdac9e3030fef6300c2c3081d0c79690488ca9472dd9b3a24b935034c7';
const LEDGER = path.join(ROOT,'workspace/task023/refresh-20261021/fresh-development-pilot/live-v2');
const PRODUCTION = ['extension/content.js','extension/background.js','extension/procedure-core.js','extension/rule-service.js','extension/sidepanel.js','extension/manifest.json','backend/local-ai.cjs','backend/procedure-families.cjs','backend/deepseek-runner.cjs','backend/codex-runner.cjs','backend/model-evidence.cjs','backend/validation-transport.cjs'];
const CODE = ['tests/local/study-preparation.cjs','tests/local/study-generation.cjs','workspace/task023/refresh-20261021/live_pilot.cjs','workspace/task023/refresh-20261021/owned_job.py','backend/deepseek-runner.cjs','backend/model-evidence.cjs'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function trace(stage,details={}){fs.writeSync(1,JSON.stringify({stage,at:new Date().toISOString(),...details})+'\n');}
async function boundedClose(resource,label){
    if(!resource)return;
    trace(label+'-close-start');let timer;
    try{const closed=Promise.resolve().then(()=>resource.close()).then(()=>'closed',()=>'failed');
        const status=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve('timed-out'),3000)})]);
        trace(label+'-close-complete',{status});
    }finally{clearTimeout(timer);}
}
function completeCLI(result){fs.writeSync(1,JSON.stringify(result||{complete:true})+'\n');process.exit(0);}
function failCLI(error){fs.writeSync(2,String(error.message)+'\n');process.exit(1);}
function resolved(file, existing = true) {
    const absolute = path.resolve(ROOT, file); let target;
    if(existing)target=fs.realpathSync(absolute);
    else{let ancestor=path.dirname(absolute);while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);target=path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,absolute));}
    if (!target.toLowerCase().startsWith((ROOT + path.sep).toLowerCase())) throw Error('Path outside owning project');
    return target;
}
const relative = file => path.relative(ROOT, file).replaceAll('\\', '/');
function save(file, value) {
    const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2);
    const handle = fs.openSync(file, 'wx'); try { fs.writeFileSync(handle, bytes); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
}
function bound(file, hash) { const target = resolved(file), bytes = fs.readFileSync(target); if (sha(bytes) !== hash) throw Error('Frozen binding changed'); return bytes; }
function normalize(input) {
    if (input.schemaVersion !== 1 || !['development-final','unseen-final'].includes(input.scope) || !Array.isArray(input.pages) || !input.pages.length) throw Error('Invalid explicit manifest');
    const ids = new Set(), first = new Map();
    const pages = input.pages.map(page => {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(page.id || '') || ids.has(page.id) || !['string','number'].includes(typeof page.site)) throw Error('Invalid/duplicate page identity'); ids.add(page.id);
        const url = new URL(page.url); if (!['http:','https:'].includes(url.protocol)) throw Error('Unsupported captured URL');
        const sourceFile = resolved(page.sourceFile), referenceFile = resolved(page.referenceFile);
        if (!first.has(page.site)) first.set(page.site, page.id);
        if (page.seedId !== first.get(page.site)) throw Error('Shared seed must be the first explicit page of its site');
        return { id: page.id, site: page.site, seedId: page.seedId, url: page.url, sourceFile: relative(sourceFile), referenceFile: relative(referenceFile), sourceSha256: sha(fs.readFileSync(sourceFile)), referenceSha256: sha(fs.readFileSync(referenceFile)) };
    });
    return { schemaVersion: 1, scope: input.scope, pages };
}
function verify(folder, page) {
    const freezeBytes = fs.readFileSync(path.join(folder, 'freeze.json'));
    if (sha(freezeBytes) !== fs.readFileSync(path.join(folder, 'freeze.sha256'), 'utf8').trim()) throw Error('Preparation freeze changed');
    const freeze = JSON.parse(freezeBytes);
    for (const map of [freeze.production, freeze.phaseCode]) for (const [file, hash] of Object.entries(map)) bound(file, hash);
    bound(SCORER, SCORER_SHA); bound(relative(path.join(folder,'strict-scorer.js')),SCORER_SHA); bound(relative(path.join(folder, 'manifest.json')), freeze.manifestSha256);
    if (process.version !== freeze.runtime.nodeVersion) throw Error('Node runtime changed');
    // Full executable hashes once per controller phase; bounded children also
    // check executable stat identity and observed browser version in metadata.
    for(const[file,key]of[[NODE,'node'],[CHROME,'chromium']]){const stat=fs.statSync(file);if(stat.size!==freeze.runtime[key].size||stat.mtimeMs!==freeze.runtime[key].mtimeMs||!page&&sha(fs.readFileSync(file))!==freeze.runtime[key].sha256)throw Error('Bound executable changed');}
    if(sha(fs.readFileSync(path.join(PW,'package.json')))!==freeze.runtime.playwrightPackageSha256)throw Error('Playwright binding changed');
    if (page) { bound(page.sourceFile, page.sourceSha256); bound(page.referenceFile, page.referenceSha256); }
    return freeze;
}
// Audited Windows Job Object owns Node and all browser descendants, even on timeout.
function child(mode, configFile, logFolder) {
    const controller = String.raw`import sys,json,os,subprocess
sys.path.insert(0,sys.argv[1])
from owned_job import OwnedJob
job=OwnedJob()
try:
 with open(sys.argv[6],'wb') as out,open(sys.argv[7],'wb') as err:
  process=job.start([sys.argv[2],sys.argv[3],sys.argv[4],sys.argv[5]],stdout=out,stderr=err,cwd=sys.argv[8])
  try: code=process.wait(timeout=90)
  except subprocess.TimeoutExpired: code=124
finally:
 cleanup=job.close()
print(json.dumps({'exitCode':code,'cleanup':cleanup}))
sys.exit(0 if code==0 and cleanup.get('activeProcesses')==0 else 1)`;
    const output = execFileSync(PYTHON, ['-c', controller, path.join(ROOT,'workspace/task023/refresh-20261021'), NODE, __filename, mode, configFile, path.join(logFolder,'stdout.txt'), path.join(logFolder,'stderr.txt'), ROOT], { cwd: ROOT, timeout: 110000, windowsHide: true, encoding: 'utf8' });
    save(path.join(logFolder,'owned-job.json'), JSON.parse(output));
}
async function offlinePage(entry, callback) {
    const { chromium } = require(PW); const browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 20000 });
    let page, timer, served = false, blocked = 0;
    try {
        page = await browser.newPage({ serviceWorkers: 'block' }); timer = setTimeout(() => {void boundedClose(page,'page-deadline');}, 75000);
        const source = bound(entry.sourceFile, entry.sourceSha256).toString('utf8');
        const mock='window.__rules=[];window.__listeners=[];window.chrome||={};window.chrome.runtime={sendMessage:async()=>({protocol:2,lookupAvailable:true,rules:window.__rules}),onMessage:{addListener:fn=>window.__listeners.push(fn)}};';
        // CDP initialization runs trusted production scripts in the new global
        // realm; response CSP blocks captured scripts/inline handlers, not DOM.
        await page.addInitScript({content:fs.readFileSync(path.join(ROOT,'extension/procedure-core.js'),'utf8')+'\n'+mock+'\n'+fs.readFileSync(path.join(ROOT,'extension/content.js'),'utf8')+'\n;globalThis.analysisSample=analysisSample;'});
        await page.route('**/*', route => { if (!served && route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) { served = true; return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers:{'Content-Security-Policy':"script-src 'none'"}, body: source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '') }); } blocked++; return route.abort(); });
        await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        trace('capture-start');
        const result=await callback(page, { node: process.version, chromium: browser.version(), playwright: read(path.join(PW,'package.json')).version, blockedRequests: () => blocked });
        trace('capture-complete');return result;
    } finally { clearTimeout(timer); await boundedClose(page,'page'); await boundedClose(browser,'browser'); }
}
async function prepareOne(cfg) {
    const folder = resolved(cfg.folder), entry = cfg.entry; verify(folder, entry);
    const output = path.join(folder, entry.id);
    const result = await offlinePage(entry, async (page, runtime) => {
        const capture = await page.evaluate(async () => {
            const sample = analysisSample(document), inventory = PreservationCore.inspect(document);
            const context = await new Promise(resolve => window.__listeners[0]({action:'EXTRACT_CONTEXT'},{},resolve));
            if (context.error || context.analysisHTML !== sample.html || JSON.stringify(context.modelEvidence) !== JSON.stringify(sample.evidence)) throw Error('Actual sampler/context mismatch');
            const { validationHTML, validationTransport, validationComplete, validationLimitation, validationContextScope, structuralDescriptor, interactionValuesOmitted } = context;
            return { html: context.analysisHTML, evidence: context.modelEvidence, sampling: context.analysisContext,
                validation: { validationHTML,validationTransport,validationComplete,validationLimitation,validationContextScope,structuralDescriptor,interactionValuesOmitted },
                unsupported: inventory.unsupported, requiredRoles: inventory.roles.length };
        });
        const { cleanHTML } = require('../../backend/local-ai.cjs');
        const args = { html: cleanHTML(capture.html), evidence: capture.evidence };
        const { DeepSeekRunner } = require('../../backend/deepseek-runner.cjs'); let request;
        const runner = new DeepSeekRunner({ apiKey: 'explicit-offline-fake-only', timeoutMs: 60000, fetchRequest: async (url, options) => {
            if (url !== 'https://api.deepseek.com/chat/completions') throw Error('Unexpected provider target');
            request = JSON.parse(options.body); require('./study-generation.cjs').validateRequest(request);
            return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"main":"main","exclude":[],"name":"Offline preparation"}'}}]}));
        } });
        try { await runner.generate(args.html,args.evidence); } finally { runner.close(); }
        save(path.join(output,'analysis-raw.html'),capture.html); save(path.join(output,'arguments.json'),args);
        save(path.join(output,'prepared-request.json'),request); save(path.join(output,'validation-context.json'),capture.validation);
        trace('capture-files-published');
        const payload={protocol:2,hostname:new URL(entry.url).hostname,html:capture.html,modelEvidence:capture.evidence,
            validationHTML:capture.validation.validationHTML,validationTransport:capture.validation.validationTransport,validationComplete:capture.validation.validationComplete,
            validationLimitation:capture.validation.validationLimitation,validationContextScope:capture.validation.validationContextScope,structuralDescriptor:capture.validation.structuralDescriptor,exampleKey:'0'.repeat(64)};
        return { id:entry.id,site:entry.site,seedId:entry.seedId,sourceSha256:entry.sourceSha256,referenceSha256:entry.referenceSha256,
            generationEligible:capture.validation.validationComplete===true&&capture.requiredRoles>0&&!capture.unsupported.length&&Buffer.byteLength(JSON.stringify(payload))<=262144,
            validationComplete:capture.validation.validationComplete,validationLimitation:capture.validation.validationLimitation,validationEncoding:capture.validation.validationTransport?.encoding||'uncompressed',
            requestBytes:Buffer.byteLength(JSON.stringify(payload)),unsupported:capture.unsupported,requiredRoles:capture.requiredRoles,sampling:capture.sampling,
            runtime:{node:runtime.node,chromium:runtime.chromium,playwright:runtime.playwright},externalNetworkRequests:0,blockedRequests:runtime.blockedRequests(),providerCalls:0,
            files:Object.fromEntries(['analysis-raw.html','arguments.json','prepared-request.json','validation-context.json'].map(name=>[name,sha(fs.readFileSync(path.join(output,name)))])) };
    });
    trace('final-verify-start');verify(folder,entry);trace('final-verify-complete');save(path.join(output,'metadata.json'),result);trace('metadata-published');
}
function prepare(manifestFile, outputFolder) {
    const input = resolved(manifestFile), folder = resolved(outputFolder,false); if(fs.existsSync(folder))throw Error('Output already exists');
    const manifest = normalize(read(input)); fs.mkdirSync(folder,{recursive:true}); save(path.join(folder,'manifest.json'),manifest);
    const runtime={nodeVersion:process.version,playwrightPackageSha256:sha(fs.readFileSync(path.join(PW,'package.json')))};
    for(const[file,key]of[[NODE,'node'],[CHROME,'chromium']]){const stat=fs.statSync(file);runtime[key]={sha256:sha(fs.readFileSync(file)),size:stat.size,mtimeMs:stat.mtimeMs};}
    const freeze={at:new Date().toISOString(),runtime,manifestInput:{file:relative(input),sha256:sha(fs.readFileSync(input))},manifestSha256:sha(fs.readFileSync(path.join(folder,'manifest.json'))),
        production:Object.fromEntries(PRODUCTION.map(file=>[file,sha(fs.readFileSync(path.join(ROOT,file)))])),phaseCode:Object.fromEntries(CODE.map(file=>[file,sha(fs.readFileSync(path.join(ROOT,file)))])),scorer:{file:SCORER,sha256:SCORER_SHA}};
    bound(SCORER,SCORER_SHA);save(path.join(folder,'strict-scorer.js'),fs.readFileSync(path.join(ROOT,SCORER)));save(path.join(folder,'freeze.json'),freeze);save(path.join(folder,'freeze.sha256'),sha(fs.readFileSync(path.join(folder,'freeze.json'))));
    const records=[],excluded=[];
    for(const entry of manifest.pages){verify(folder,entry);const pageFolder=path.join(folder,entry.id);fs.mkdirSync(pageFolder);const config=path.join(pageFolder,'prepare-config.json');save(config,{folder,entry});child('_prepare-one',config,pageFolder);
        const metadata=read(path.join(pageFolder,'metadata.json'));const record={id:manifest.scope+'-'+entry.id,requestFile:relative(path.join(pageFolder,'prepared-request.json')),requestSha256:metadata.files['prepared-request.json'],argumentsFile:relative(path.join(pageFolder,'arguments.json')),argumentsSha256:metadata.files['arguments.json']};
        if(metadata.generationEligible)records.push(record);else excluded.push({id:entry.id,reason:metadata.validationLimitation||metadata.unsupported.join(',')||'unusable-context'});
    }
    const inputs={[relative(input)]:freeze.manifestInput.sha256};for(const name of ['freeze.json','freeze.sha256','manifest.json','strict-scorer.js'])inputs[relative(path.join(folder,name))]=sha(fs.readFileSync(path.join(folder,name)));for(const entry of manifest.pages){inputs[entry.sourceFile]=entry.sourceSha256;inputs[entry.referenceFile]=entry.referenceSha256;for(const name of ['metadata.json','validation-context.json'])inputs[relative(path.join(folder,entry.id,name))]=sha(fs.readFileSync(path.join(folder,entry.id,name)));}
    const plan={schemaVersion:1,scope:manifest.scope,bindings:{phaseCode:freeze.phaseCode,production:freeze.production,scorer:{[SCORER]:SCORER_SHA},inputs},records};save(path.join(folder,'study-plan.json'),plan);save(path.join(folder,'preparation-summary.json'),{pages:manifest.pages.length,eligible:records.length,excluded,providerCalls:0,externalNetworkRequests:0,freezeSha256:sha(fs.readFileSync(path.join(folder,'freeze.json'))),planSha256:sha(fs.readFileSync(path.join(folder,'study-plan.json')))});save(path.join(folder,'preparation-summary.sha256'),sha(fs.readFileSync(path.join(folder,'preparation-summary.json'))));return{folder,pages:manifest.pages.length,eligible:records.length,excluded};
}
function preparedBindings(folder,entry,expectedPlanSha256){
    const bytes=fs.readFileSync(path.join(folder,'preparation-summary.json')),checksum=fs.readFileSync(path.join(folder,'preparation-summary.sha256'),'utf8').trim();
    if(!/^[a-f0-9]{64}$/.test(checksum)||sha(bytes)!==checksum)throw Error('Preparation summary binding changed');
    const summary=JSON.parse(bytes),planBytes=fs.readFileSync(path.join(folder,'study-plan.json'));
    if(!/^[a-f0-9]{64}$/.test(expectedPlanSha256||'')||summary.planSha256!==expectedPlanSha256||sha(planBytes)!==summary.planSha256||sha(fs.readFileSync(path.join(folder,'freeze.json')))!==summary.freezeSha256)throw Error('Prepared plan root changed');
    const plan=JSON.parse(planBytes),manifest=read(path.join(folder,'manifest.json'));
    if(plan.schemaVersion!==1||plan.scope!==manifest.scope)throw Error('Prepared plan scope mismatch');
    const inputs=plan.bindings?.inputs;if(!inputs)throw Error('Prepared input bindings absent');
    const selected=entry?[entry]:manifest.pages;
    for(const page of selected)for(const name of['metadata.json','validation-context.json']){const file=relative(path.join(folder,page.id,name));bound(file,inputs[file]);}
    if(!entry)for(const[file,hash]of Object.entries(inputs))bound(file,hash);
    return{plan,planSha256:summary.planSha256};
}
function authenticateStudyCandidate(prepared,entry,record,ledgerFolder=LEDGER){
    const id=prepared.plan.scope+'-'+entry.id,planned=prepared.plan.records.find(value=>value.id===id);
    if(!planned)throw Error('Page has no frozen generation record');
    const request=bound(planned.requestFile,planned.requestSha256);bound(planned.argumentsFile,planned.argumentsSha256);
    const reservations=fs.readdirSync(path.join(ledgerFolder,'events')).filter(name=>/^\d{3}-a-reserved\.json$/.test(name)).map(name=>read(path.join(ledgerFolder,'events',name))).filter(value=>value.id===id);
    if(reservations.length!==1)throw Error('Canonical page reservation absent or ambiguous');
    const reservation=reservations[0],outcomeFile=path.join(ledgerFolder,'events',String(reservation.sequence).padStart(3,'0')+'-b-outcome.json');
    if(reservation.scope!==prepared.plan.scope||reservation.planSha256!==prepared.planSha256||reservation.requestFileSha256!==planned.requestSha256||reservation.wireRequestSha256!==sha(JSON.stringify(JSON.parse(request))))throw Error('Canonical prepared request mismatch');
    if(record.attemptId!==id||resolved(record.outcomeFile)!==fs.realpathSync(outcomeFile))throw Error('Receipt belongs to another prepared page');
    const outcome=JSON.parse(bound(relative(outcomeFile),record.outcomeSha256));
    if(outcome.id!==id)throw Error('Canonical outcome identity mismatch');
    if(record.candidateFile){const expected=path.join(ledgerFolder,id,'provider-result.json');if(resolved(record.candidateFile)!==fs.realpathSync(expected)||outcome.success!==true||outcome.resultSha256!==record.candidateSha256)throw Error('Canonical candidate/result mismatch');bound(record.candidateFile,record.candidateSha256);}
    else if(outcome.success!==false)throw Error('Absent candidate requires failed canonical outcome');
}
function policyProcedure(approach,compilation,eligible){return approach==='compiled-shared'||eligible?compilation?.procedure:null;}
function candidatesFor(file,manifest,folder,expectedPlanSha256){
    const data=read(resolved(file));
    if(data.schemaVersion!==1||!['retained-development-check','study-results'].includes(data.provenance)||!Array.isArray(data.records))throw Error('Explicit candidate provenance required');
    if(data.provenance==='retained-development-check'&&manifest.scope!=='development-final')throw Error('Retained provenance is restricted to development-final');
    const prepared=preparedBindings(folder,undefined,expectedPlanSha256),map=new Map();
    for(const record of data.records){
        const entry=manifest.pages.find(page=>page.id===record.id);
        if(map.has(record.id)||!entry)throw Error('Candidate identity mismatch');
        const eligible=read(path.join(folder,record.id,'metadata.json')).generationEligible;
        if(!eligible&&record.candidateFile)throw Error('Ineligible page cannot receive a generated candidate');
        if(record.candidateFile)bound(record.candidateFile,record.candidateSha256);
        if(data.provenance==='study-results')authenticateStudyCandidate(prepared,entry,record);
        else if(!record.candidateFile)throw Error('Retained candidate missing');
        map.set(record.id,{...record,provenance:data.provenance});
    }
    for(const entry of manifest.pages){const metadata=read(path.join(folder,entry.id,'metadata.json'));if(!metadata.generationEligible){if(!map.has(entry.id))map.set(entry.id,{id:entry.id,sourceEligibilityFailure:true});}else if(!map.has(entry.id))throw Error('Eligible page lacks completed bound outcome');}
    map.provenance=data.provenance;return map;
}
async function scoreOne(cfg){
    const folder=resolved(cfg.folder),output=resolved(cfg.output),entry=cfg.entry;verify(folder,entry);preparedBindings(folder,entry,cfg.expectedPlanSha256);const eligibility=read(path.join(folder,entry.id,'metadata.json'));const candidate=cfg.candidate.candidateFile?JSON.parse(bound(cfg.candidate.candidateFile,cfg.candidate.candidateSha256)).rule:null;if(cfg.candidate.candidateFile&&!candidate)throw Error('Candidate rule missing');
    const scorer=vm.runInNewContext('('+bound(SCORER,SCORER_SHA).toString('utf8')+')');
    await offlinePage(entry,async page=>{const fresh=candidate?await page.evaluate(candidate=>{try{return{procedure:PreservationCore.compile(document,candidate)}}catch(error){return{error:error.message}}},candidate):{error:eligibility.generationEligible?'bound-provider-attempt-failed':'source-eligibility-failure',sourceEligibilityFailure:!eligibility.generationEligible};let seed;
        if(entry.id===entry.seedId){seed={id:entry.id,site:entry.site,...fresh};save(path.join(output,'seed-procedure.json'),seed);}else{seed=JSON.parse(bound(cfg.seedFile,cfg.seedSha256));if(seed.id!==entry.seedId||seed.site!==entry.site)throw Error('Shared seed mismatch');}
        const rows=[];for(const[approach,compilation]of[['fallback',null],['compiled-fresh',fresh],['compiled-shared',seed]]){const procedure=policyProcedure(approach,compilation,eligibility.generationEligible);await page.evaluate(procedure=>{window.__rules=procedure?[procedure]:[]},procedure||null);const measured=await page.evaluate(scorer,JSON.parse(bound(entry.referenceFile,entry.referenceSha256)));const{html,analysisHTML,...delivery}=measured.out;delete measured.out;measured.noFallbackPass=measured.complete===true&&delivery.noFallback===true&&delivery.ruleApplied===true&&delivery.procedureDelivered===true;const row={id:entry.id,site:entry.site,seedId:entry.seedId,approach,candidateProvenance:cfg.provenance,score:measured,delivery,compilation,sourceEligibilityFailure:!eligibility.generationEligible,measurementComplete:true,timingClaim:false,providerCalls:0,sourceSha256:entry.sourceSha256,referenceSha256:entry.referenceSha256,candidateSha256:cfg.candidate.candidateSha256,procedureSha256:procedure?sha(JSON.stringify(procedure)):null};save(path.join(output,approach+'.html'),html||'');save(path.join(output,approach+'.json'),row);rows.push(row);}save(path.join(output,'rows.json'),rows);});
}
function score(folderFile,candidateFile,outputFolder,expectedPlanSha256){const folder=resolved(folderFile),manifest=read(path.join(folder,'manifest.json'));verify(folder);const candidates=candidatesFor(candidateFile,manifest,folder,expectedPlanSha256),output=resolved(outputFolder,false);if(fs.existsSync(output))throw Error('Scoring output exists');fs.mkdirSync(output,{recursive:true});save(path.join(output,'bindings.json'),{preparationFreeze:sha(fs.readFileSync(path.join(folder,'freeze.json'))),candidateManifest:{file:relative(resolved(candidateFile)),sha256:sha(fs.readFileSync(resolved(candidateFile)))},scorerSha256:SCORER_SHA});const seeds=new Map(),rows=[];for(const entry of manifest.pages){verify(folder,entry);const pageOutput=path.join(output,entry.id);fs.mkdirSync(pageOutput);const config={folder,entry,output:pageOutput,expectedPlanSha256,provenance:candidates.provenance,candidate:candidates.get(entry.id)};if(entry.id!==entry.seedId){const seed=seeds.get(entry.seedId);if(!seed)throw Error('First-page seed was not measured');config.seedFile=relative(seed);config.seedSha256=sha(fs.readFileSync(seed));}const configFile=path.join(pageOutput,'score-config.json');save(configFile,config);child('_score-one',configFile,pageOutput);if(entry.id===entry.seedId)seeds.set(entry.id,path.join(pageOutput,'seed-procedure.json'));rows.push(...read(path.join(pageOutput,'rows.json')));save(path.join(output,'checkpoint-'+entry.id+'.json'),{completedPages:rows.length/3});}save(path.join(output,'summary.json'),{rows,candidateProvenance:candidates.provenance,providerCalls:0,timingClaim:false,claim:'Fixed-candidate correctness replay; no fresh inference or cold API admission measured'});return{pages:manifest.pages.length,rows:rows.length};}
module.exports={normalize,prepare,verify,score,preparedBindings,authenticateStudyCandidate,policyProcedure,candidatesFor,boundedClose,completeCLI,failCLI,SCORER,SCORER_SHA};
if(require.main===module)(async()=>{const[mode,a,b,c,d]=process.argv.slice(2);if(mode==='prepare')return prepare(a,b);if(mode==='score')return score(a,b,c,d);if(mode==='_prepare-one')return prepareOne(read(resolved(a)));if(mode==='_score-one')return scoreOne(read(resolved(a)));throw Error('Use prepare MANIFEST OUT or score PREPARED CANDIDATES OUT');})().then(completeCLI).catch(failCLI);
