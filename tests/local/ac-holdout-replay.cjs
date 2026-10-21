// Deterministic replay of the sealed44 testing pages. Import performs no reads,
// browser launches, requests, provider operations or output writes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const HISTORICAL = 'workspace/task023/holdout-20261019';
const EXPECTED_FREEZE = '7c2cb32de4b1912d74e54cc27a93e6c5a538b07be6c189778e093b489070177d';
const BASELINE = 'f21ba71091f94e08461455f3d8dbdc8ac02853a9';
const BASELINE_ARTIFACT = 'docs/evaluation/development-2026-10-21-ac-memo/freeze.json';
const BASELINE_ARTIFACT_SHA = '8905c05033bee339bc9109dda99b27cacc308647f59d2bc403b986d2ea1a6870';
const COMPARISON_PATH='workspace/task023/revised-testing/frozen-e8-v1/full-summary.json';
const COMPARISON_SHA='e2d2f8e5c18b72501910327d51a7f96586c90b140bbb82f32f2e5dae2da11573';
const CHROMIUM = 'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe';
const PLAYWRIGHT = 'C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const APPROACHES = ['fallback', 'compiled-fresh', 'compiled-shared'];
const PRODUCTION = ['extension/procedure-core.js','extension/content.js','extension/background.js','extension/rule-service.js','extension/sidepanel.js','extension/manifest.json','backend/local-ai.cjs','backend/procedure-families.cjs','backend/deepseek-runner.cjs','backend/codex-runner.cjs'];
const SELF = ['tests/local/ac-holdout-replay.cjs', 'tests/local/ac-holdout-replay-test.cjs','tests/local/ac-testing-gate.cjs','tests/local/ac-testing-gate-test.cjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const canonical = value => value.replaceAll('\\', '/');
function target(base, relative) {
    const resolved = path.resolve(base, canonical(relative));
    if (!resolved.startsWith(path.resolve(base) + path.sep)) throw Error('Path escapes owner: ' + relative);
    return resolved;
}
function verifyFiles(base, files) {
    for (const [file, expected] of Object.entries(files)) if (hash(fs.readFileSync(target(base, file))) !== expected) throw Error('Hash drift: ' + file);
}
function assertPinned({baseline=BASELINE,artifactSha256=BASELINE_ARTIFACT_SHA}={}){if(!/^[a-f0-9]{40}$/.test(baseline)||!/^[a-f0-9]{64}$/.test(artifactSha256))throw Error('Parent production freeze pins not accepted; testing-input reads and execution prohibited');}
function verifyBaselineArtifact(ownerRoot,bytes,expectedSha){
    if(hash(bytes)!==expectedSha)throw Error('Declared baseline artifact trust anchor mismatch');
    const frozen=JSON.parse(bytes),files={};
    for(const file of PRODUCTION){if(!/^[a-f0-9]{64}$/.test(frozen.files?.[file]||''))throw Error('Missing frozen production binding');files[file]=frozen.files[file];}
    verifyFiles(ownerRoot,files);return files;
}
function productionBaseline(ownerRoot=ROOT){
    assertPinned();
    const bytes=require('node:child_process').execFileSync('git',['show',BASELINE+':'+BASELINE_ARTIFACT],{cwd:ownerRoot,timeout:15000,maxBuffer:4*1024*1024,windowsHide:true});
    return verifyBaselineArtifact(ownerRoot,bytes,BASELINE_ARTIFACT_SHA);
}
function comparisonBaseline(){
    const bytes=fs.readFileSync(path.join(ROOT,COMPARISON_PATH));if(hash(bytes)!==COMPARISON_SHA)throw Error('Fixed e8 comparison summary drift');
    const shared=JSON.parse(bytes).paperGate?.metrics?.['compiled-shared'];
    if(!shared||shared.noFallbackPages!==32||shared.noFallbackSites!==14||shared.completePages!==40||shared.completeSites!==20)throw Error('Predeclared comparison counts mismatch');
    return{path:COMPARISON_PATH,sha256:COMPARISON_SHA,sharedNoFallbackPages:32,sharedNoFallbackSites:14,sharedReadingPages:40,sharedReadingSites:20};
}
function rowDiagnostics(delivery,compilation){return{chosenSelectors:delivery.chosenSelectors??delivery.selectedSelectors??null,alternativeUsed:delivery.alternativeUsed??null,attemptedCombinations:delivery.attemptedCombinations??null,descriptorFamily:delivery.descriptorFamily??delivery.familyKey??compilation?.procedure?.familyKey??null,compiledDescriptor:compilation?.procedure?.preconditions?.scope??null};}
const runtimeCache=new Map();
function fingerprint(file){const stat=fs.statSync(file),signature=[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');let cached=runtimeCache.get(file);if(!cached||cached.signature!==signature){cached={signature,sha256:hash(fs.readFileSync(file))};runtimeCache.set(file,cached);}return{path:file,size:stat.size,sha256:cached.sha256};}
function moduleFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(d=>{const file=path.join(directory,d.name);return d.isDirectory()?moduleFiles(file):/\.(?:js|cjs|mjs|json)$/.test(d.name)?[file]:[];});}
function chromiumFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(d=>{const file=path.join(directory,d.name);if(d.isDirectory())return chromiumFiles(file);if(d.isFile())return[file];throw Error('Unsupported Chromium installation entry: '+file);});}
function runtimeIdentity(options={}){
    const isolated=Object.hasOwn(options,'files');
    const moduleRoots=options.moduleRoots??(isolated?[]:[PLAYWRIGHT,path.join(path.dirname(PLAYWRIGHT),'playwright-core')]);
    const chromiumRoot=options.chromiumRoot??(isolated?null:path.dirname(CHROMIUM));
    const files={...(options.files||{nodeBinary:process.execPath,chromiumBinary:CHROMIUM})};
    for(const directory of moduleRoots)for(const file of moduleFiles(directory))files[path.basename(directory)+'/'+canonical(path.relative(directory,file))]=file;
    if(chromiumRoot)for(const file of chromiumFiles(chromiumRoot))files['chromium-installation/'+canonical(path.relative(chromiumRoot,file))]=file;
    const identities=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([key,file])=>[key,fingerprint(file)]));
    let versions=options.versions;
    if(!versions){
        if(isolated)throw Error('Isolated runtime files require explicit synthetic versions');
        const chrome=runtimeCache.get(CHROMIUM);
        if(!chrome.version){const quoted=CHROMIUM.replaceAll("'","''");chrome.version=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"(Get-Item -LiteralPath '"+quoted+"').VersionInfo.ProductVersion"],{encoding:'utf8',timeout:10000,windowsHide:true}).trim();}
        if(!chrome.version)throw Error('Chromium file version unavailable');
        versions={node:process.version,v8:process.versions.v8,chromiumFileVersion:chrome.version,playwright:read(path.join(PLAYWRIGHT,'package.json')).version,playwrightCore:read(path.join(path.dirname(PLAYWRIGHT),'playwright-core/package.json')).version};
    }
    return{versions,files:identities,verification:'Every regular file in Chromium Application installation tree plus Node and Playwright modules is bound. Hash on first use in each process; later checks enumerate/stat every file and rehash changed size/mtime/ctime/inode. Added/removed companions reject drift. Chromium version is PE metadata; no preflight browser launch.'};
}
function verifyRuntime(expected,options){const current=runtimeIdentity(options);if(JSON.stringify(current)!==JSON.stringify(expected))throw Error('Execution runtime drift');return current;}
function immutable(file, value) { fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx' }); }
function outputDirectory(tag) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(tag || '')) throw Error('Supply a bounded immutable --tag');
    return path.join(ROOT, 'workspace/task023/ac-testing', tag);
}
function assertManifest(manifest) {
    if (manifest.candidateDenominator !== 40 || manifest.dispositions?.length !== 40 || new Set(manifest.dispositions.map(s => s.domain)).size !== 40) throw Error('Expected40 original candidates');
    if (!Array.isArray(manifest.pages) || manifest.pages.length !== 44 || new Set(manifest.pages.map(p => p.id)).size !== 44) throw Error('Expected44 unique original pages');
    const sites = manifest.dispositions.filter(s => s.eligible);
    if (sites.length !== 22 || new Set(sites.map(s => s.index)).size !== 22) throw Error('Expected22 eligible sites');
    for (const p of manifest.pages) if (!/^[a-zA-Z0-9-]+$/.test(p.id) || ![1,2].includes(p.position) || !sites.some(s => s.index === p.site)) throw Error('Invalid page identity/site/position');
    for (const site of sites) {
        const pages = manifest.pages.filter(p => p.site === site.index);
        if (pages.length !== 2 || pages[0].position !== 1 || pages[1].position !== 2 || site.pages?.length !== 2 || pages.some((p,i) => p.id !== site.pages[i].id)) throw Error('Original ordered pair drift');
    }
}
function verifyEventPage(directory, page, events) {
    const own = events.filter(e => e.page === page.id);
    const one = event => { const matches = own.filter(e => e.event === event); if (matches.length !== 1) throw Error('Expected one historical ' + event + ': ' + page.id); return matches[0]; };
    const start = one('started'), completed = one('completed'), backend = one('backend-result');
    if (start.attempt !== completed.attempt || own.some(e => e.event === 'failed')) throw Error('Historical attempt mismatch');
    const bindings = { 'source.html': page.sha256, 'references.json': page.referenceSha256,
        'analysis-context.json': start.contextSha256, 'model-input.html': start.inputSha256,
        'provider-result.json': completed.outputSha256, 'backend-result.json': backend.backendSha256 };
    if (backend.contextSha256 !== start.contextSha256 || Object.values(bindings).some(h => !/^[a-f0-9]{64}$/.test(h || ''))) throw Error('Missing context/output binding');
    verifyFiles(directory, bindings);
    const raw = read(path.join(directory, 'provider-result.json'));
    if (!Object.hasOwn(raw, 'rule')) throw Error('Historical raw provider candidate missing');
    // Historical normalization is an audited record only. Never invoke the
    // CURRENT validator to rederive an earlier version's normalized rule.
    return { bindings, rawCandidate: raw.rule, historicalBackend: read(path.join(directory, 'backend-result.json')), requestId: completed.requestId || null };
}
function historicalInputs(ownerRoot = ROOT) {
    assertPinned();
    const base = path.join(ownerRoot, HISTORICAL), manifestFile = path.join(base, 'manifest.json');
    const bytes = fs.readFileSync(manifestFile), manifest = JSON.parse(bytes);
    if (hash(bytes) !== fs.readFileSync(path.join(base, 'manifest.sha256'), 'utf8').trim()) throw Error('Historical manifest checksum mismatch');
    assertManifest(manifest);
    const freezeBytes = fs.readFileSync(path.join(base, 'harness-freeze.json'));
    if (hash(freezeBytes) !== EXPECTED_FREEZE) throw Error('Historical freeze trust anchor mismatch');
    const historicalFreeze = JSON.parse(freezeBytes);
    if (historicalFreeze.manifestSha256 !== hash(bytes) || Object.keys(historicalFreeze.files).length !== 317) throw Error('Original317 binding/manifest mismatch');
    verifyFiles(ownerRoot, historicalFreeze.files);
    const protocol = read(path.join(base, 'protocol.json'));
    if (hash(fs.readFileSync(path.join(base, 'protocol.json'))) !== manifest.protocolSha256) throw Error('Historical protocol drift');
    if (protocol.candidates.filter(c => !c.seenInDevelopment).length !== 40) throw Error('Historical protocol candidate mismatch');
    const events = fs.readFileSync(path.join(base, 'provider-attempts.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    for (const event of ['started','completed','backend-result']) if (events.filter(e => e.event === event).length !== 44) throw Error('Expected44 historical ' + event + ' events');
    if (events.some(e => e.event === 'failed') || events.some(e => !manifest.pages.some(p => p.id === e.page))) throw Error('Unexpected historical attempt/page');
    const inputs = { ...historicalFreeze.files }, candidates = {};
    for (const name of ['manifest.json','manifest.sha256','harness-freeze.json','protocol.json','provider-attempts.jsonl']) inputs[HISTORICAL + '/' + name] = hash(fs.readFileSync(path.join(base, name)));
    for (const p of manifest.pages) {
        const verified = verifyEventPage(path.join(base, p.id), p, events); candidates[p.id] = verified;
        for (const [name, expected] of Object.entries(verified.bindings)) inputs[HISTORICAL + '/' + p.id + '/' + name] = expected;
    }
    const source = fs.readFileSync(path.join(ownerRoot, 'tests/local/holdout.cjs'), 'utf8');
    const marker = 'const result=await pg.evaluate(', at = source.indexOf(marker);
    const end = source.indexOf('},refs);', at);
    if (at < 0 || end < 0) throw Error('Original frozen scorer boundary missing');
    const scorerSource = source.slice(at + marker.length, end + 1);
    const scorer = vm.runInNewContext('(' + scorerSource + ')');
    return { manifest, candidates, inputs, scorerSource, scorer, historicalBindingCount:317 };
}
function preflight() {
    assertPinned();
    const productionFiles=productionBaseline(),comparison=comparisonBaseline(),original = historicalInputs();
    const files = {...productionFiles,...Object.fromEntries(SELF.map(f => [f, hash(fs.readFileSync(path.join(ROOT, f)))]))};
    return { ...original, inputs:{...original.inputs,[COMPARISON_PATH]:COMPARISON_SHA}, files, comparison, runtime:runtimeIdentity() };
}
function prepare(tag) {
    const output = outputDirectory(tag); if (fs.existsSync(output)) throw Error('Immutable output tag already exists');
    const state = preflight(); fs.mkdirSync(output, { recursive: true });
    const snapshot = {};
    for (const f of [...PRODUCTION,...SELF]) { const name = 'snapshot-' + f.replaceAll('/', '_'); immutable(path.join(output, name), fs.readFileSync(path.join(ROOT,f))); snapshot[name] = state.files[f]; }
    immutable(path.join(output,'original-manifest.json'), fs.readFileSync(path.join(ROOT,HISTORICAL,'manifest.json')));
    snapshot['original-manifest.json'] = hash(fs.readFileSync(path.join(output,'original-manifest.json')));
    immutable(path.join(output,'strict-scorer.js'), state.scorerSource); snapshot['strict-scorer.js'] = hash(state.scorerSource);
    const freeze = { at:new Date().toISOString(), productionBaseline:BASELINE,baselineArtifact:BASELINE_ARTIFACT,baselineArtifactSha256:BASELINE_ARTIFACT_SHA,runtime:state.runtime, comparisonBaseline:state.comparison, files:state.files, inputs:state.inputs, snapshot,
        scorerSha256:hash(state.scorerSource), originalManifestSha256:snapshot['original-manifest.json'], originalFreezeSha256:EXPECTED_FREEZE,
        mode:'same44-retained-raw-candidate-replay-zero-generation', fixedPages:44, fixedSites:22, originalCandidates:40 };
    immutable(path.join(output,'freeze.json'),freeze); immutable(path.join(output,'freeze.sha256'),hash(fs.readFileSync(path.join(output,'freeze.json'))));
    return { output, freezeSha256:hash(fs.readFileSync(path.join(output,'freeze.json'))), pages:44, pairs:22, newGenerationCalls:0, liveSiteCalls:0 };
}
function verifyFreeze(output) {
    assertPinned();
    const bytes = fs.readFileSync(path.join(output,'freeze.json'));
    if (hash(bytes) !== fs.readFileSync(path.join(output,'freeze.sha256'),'utf8').trim()) throw Error('Replay freeze drift');
    const freeze = JSON.parse(bytes); verifyFiles(ROOT,freeze.files); verifyFiles(ROOT,freeze.inputs); verifyFiles(output,freeze.snapshot);verifyRuntime(freeze.runtime);
    if(freeze.productionBaseline!==BASELINE||freeze.baselineArtifactSha256!==BASELINE_ARTIFACT_SHA)throw Error('Declared production baseline drift');
    if (freeze.fixedPages !== 44 || freeze.fixedSites !== 22 || freeze.originalCandidates !== 40 || freeze.originalFreezeSha256 !== EXPECTED_FREEZE) throw Error('Replay freeze denominator/provenance drift');
    const manifest = read(path.join(output,'original-manifest.json')); assertManifest(manifest);
    if (hash(fs.readFileSync(path.join(output,'strict-scorer.js'))) !== freeze.scorerSha256) throw Error('Frozen scoring callback drift');
    return { freeze, manifest, freezeSha256:hash(bytes) };
}
function checkpointFiles(output) { return fs.readdirSync(output).filter(f => /^checkpoint-\d{4}\.json$/.test(f)).sort(); }
function verifiedRows(output, manifest) {
    const rows = [], files = {}, completed = new Set();
    for (const name of checkpointFiles(output)) {
        const checkpoint = read(path.join(output,name));
        if (checkpoint.freezeSha256 !== hash(fs.readFileSync(path.join(output,'freeze.json')))) throw Error('Checkpoint freeze binding mismatch');
        const page = manifest.pages.find(p => p.id === checkpoint.id);
        if (!page || completed.has(page.id)) throw Error('Checkpoint page identity/duplicate mismatch');
        verifyFiles(output,checkpoint.files);
        for (const approach of APPROACHES) {
            const prefix = page.id + '-' + approach;
            if (!checkpoint.files[prefix+'.json'] || !checkpoint.files[prefix+'.html']) throw Error('Missing bound individual result');
            const row = read(path.join(output,prefix+'.json'));
            if (row.id !== page.id || row.site !== page.site || row.position !== page.position || row.approach !== approach) throw Error('Individual row identity mismatch');
            rows.push(row);
        }
        Object.assign(files,checkpoint.files); completed.add(page.id);
    }
    return { rows, files, completed };
}
function metrics(rows, manifest) {
    return Object.fromEntries(APPROACHES.map(approach => {
        const selected = rows.filter(r => r.approach === approach), pass = r => r.score?.complete === true;
        const nf = r => pass(r) && r.score.noFallbackPass === true && r.delivery?.ruleApplied === true && r.delivery?.noFallback === true && r.delivery?.procedureDelivered === true;
        const joint = predicate => manifest.dispositions.filter(s => s.eligible).filter(s => { const pair=selected.filter(r=>r.site===s.index);return pair.length===2&&pair.some(r=>r.position===1)&&pair.some(r=>r.position===2)&&pair.every(predicate); }).length;
        return [approach,{ fixedPages:44,fixedSites:22,originalCandidates:40,recordedPages:selected.length,measuredPages:selected.filter(r=>r.measurementComplete===true&&!r.measurementError).length,missingPages:44-selected.length,
            readingPassPages:selected.filter(pass).length,noFallbackPages:selected.filter(nf).length,readingPassSites:joint(pass),noFallbackSites:joint(nf),
            ruleAppliedPages:selected.filter(r=>r.delivery?.ruleApplied).length,measurementErrors:selected.filter(r=>r.measurementError).length }];
    }));
}
function errorRow(entry,approach,error){return{id:entry.id,site:entry.site,position:entry.position,approach,score:{total:0,retained:0,complete:false,usedRule:false,noFallbackPass:false,targets:[],links:[],images:[],noise:[],relativeUrls:null},delivery:{usedRule:false,ruleApplied:false,noFallback:false,procedureDelivered:false,runtimeSupplementation:false,delivery:'measurement-error'},measurementComplete:false,measurementError:String(error.message||error)};}
function sharedCompilation(output,entry,manifest,boundFiles){
    const name='pair-'+entry.site+'-seed.json';
    if(!boundFiles[name])return{measurementError:'Shared seed lacks completed first-page binding'};
    verifyFiles(output,{[name]:boundFiles[name]});
    const seed=read(path.join(output,name)),original=manifest.pages.find(p=>p.site===entry.site&&p.position===1);
    if(seed.id!==original.id||seed.site!==entry.site)throw Error('Shared seed identity mismatch');
    return seed;
}
async function executePolicies(plans,measure,onError){for(const[approach,compilation]of plans){try{if(compilation?.measurementError)throw Error(compilation.measurementError);await measure(approach,compilation);}catch(error){await onError(approach,error);}}}
async function replay({tag, mode, acceptedPilot}) {
    if (!['pilot','full'].includes(mode)) throw Error('Choose explicit pilot/full mode');
    const output=outputDirectory(tag),state=verifyFreeze(output),previous=verifiedRows(output,state.manifest);
    const pilotPages=state.manifest.pages.filter(p=>state.manifest.dispositions.filter(s=>s.eligible).slice(0,2).some(s=>s.index===p.site));
    if (mode==='full') {
        const pilotFile=path.join(output,'pilot-checkpoint.json');
        if (!acceptedPilot || hash(fs.readFileSync(pilotFile))!==acceptedPilot) throw Error('Full replay requires parent accepted pilot checksum');
        const pilot=read(pilotFile); if(pilot.freezeSha256!==state.freezeSha256||pilot.ids.length!==4||pilot.checkpoints?.length!==4||pilotPages.some(p=>!pilot.ids.includes(p.id)||!previous.completed.has(p.id)))throw Error('Pilot acceptance/input mismatch');
        verifyFiles(output,Object.fromEntries(pilot.checkpoints.map(c=>[c.file,c.sha256])));
    }
    const selected=mode==='pilot'?pilotPages:state.manifest.pages;
    if(mode==='pilot'&&fs.existsSync(path.join(output,'pilot-checkpoint.json')))throw Error('Pilot already sealed');
    const scorer=vm.runInNewContext('('+fs.readFileSync(path.join(output,'strict-scorer.js'),'utf8')+')');
    verifyRuntime(state.freeze.runtime);
    const {chromium}=require(PLAYWRIGHT);
    const browser=await chromium.launch({executablePath:CHROMIUM,headless:true});
    try { for(const entry of selected) {
        verifyFreeze(output); if(previous.completed.has(entry.id))continue;
        const prefix=entry.id+'-',seedName='pair-'+entry.site+'-seed.json';
        if(fs.readdirSync(output).some(n=>n.startsWith(prefix)))throw Error('Uncheckpointed partial page exists; preserve for parent diagnosis');
        const before=new Set(fs.readdirSync(output)),raw=fs.readFileSync(path.join(ROOT,HISTORICAL,entry.id,'source.html'),'utf8');
        const candidate=read(path.join(ROOT,HISTORICAL,entry.id,'provider-result.json')).rule,refs=read(path.join(ROOT,HISTORICAL,entry.id,'references.json'));
        const page=await browser.newPage(),timer=setTimeout(()=>page.close().catch(()=>{}),90000);
        try {
            await page.route('**/*',r=>r.request().isNavigationRequest()&&r.request().frame()===page.mainFrame()?r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')}):r.abort());
            await page.goto(entry.finalUrl,{timeout:20000,waitUntil:'domcontentloaded'});
            await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,'extension/procedure-core.js'),'utf8')});
            const fresh=await page.evaluate(candidate=>{try{return{procedure:PreservationCore.compile(document,candidate)}}catch(e){return{error:e.message}}},candidate);
            let seed;
            if(entry.position===1){seed={id:entry.id,site:entry.site,...fresh};immutable(path.join(output,seedName),seed);}
            else seed=sharedCompilation(output,entry,state.manifest,previous.files);
            await page.evaluate(()=>{window.__rules=[];window.__listeners=[];window.chrome ||= {};window.chrome.runtime={sendMessage:async()=>({rules:window.__rules}),onMessage:{addListener:f=>window.__listeners.push(f)}};});
            await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,'extension/content.js'),'utf8')});
            const sample=await page.evaluate(async()=>{const direct=analysisSample(document),out=await new Promise(r=>window.__listeners[0]({action:'EXTRACT_CONTEXT'},{},r));return{html:out.analysisHTML,context:out.analysisContext,sameAsDirect:out.analysisHTML===direct.html};});
            if(!sample.html||sample.html.length>12000||!sample.sameAsDirect)throw Error('Analysis sample over12000/missing/inconsistent');
            immutable(path.join(output,prefix+'analysis.html'),sample.html);immutable(path.join(output,prefix+'sampling.json'),{id:entry.id,characters:sample.html.length,context:sample.context,sameAsDirect:true});
            await executePolicies([['fallback',null],['compiled-fresh',fresh],['compiled-shared',seed]],async(approach,compilation)=>{
                const procedure=compilation?.procedure||null;await page.evaluate(rule=>{window.__rules=rule?[rule]:[];},procedure);
                const measured=await page.evaluate(scorer,refs),{html,analysisHTML,...delivery}=measured.out;
                delete measured.out;
                measured.noFallbackPass=measured.complete===true&&delivery.noFallback===true&&delivery.ruleApplied===true&&delivery.procedureDelivered===true;
                const row={id:entry.id,site:entry.site,position:entry.position,approach,score:measured,delivery,compilation,diagnostics:rowDiagnostics(delivery,compilation),measurementComplete:true,
                    procedureSha256:procedure?hash(JSON.stringify(procedure)):null,sharedSeedId:seed.id,sourceSha256:entry.sha256,referenceSha256:entry.referenceSha256,
                    rawCandidateSha256:hash(fs.readFileSync(path.join(ROOT,HISTORICAL,entry.id,'provider-result.json'))),engine:browser.version(),claim:'same-testing-set retained raw candidate compilation; zero new generation; no cold API/model-quality claim'};
                immutable(path.join(output,prefix+approach+'.html'),html||'');immutable(path.join(output,prefix+approach+'.json'),row);
            },async(approach,error)=>{immutable(path.join(output,prefix+approach+'.html'),'');immutable(path.join(output,prefix+approach+'.json'),errorRow(entry,approach,error));});
        } catch(error) {
            // Preserve any successful policy rows. Missing policy rows receive
            // explicit failures; never drop a difficult page from44 denominators.
            for(const approach of APPROACHES){const f=path.join(output,prefix+approach+'.json');if(!fs.existsSync(f)){immutable(path.join(output,prefix+approach+'.html'),'');immutable(f,errorRow(entry,approach,error));}}
        } finally {clearTimeout(timer);await page.close().catch(()=>{});}
        verifyFreeze(output);
        const files=Object.fromEntries(fs.readdirSync(output).filter(n=>!before.has(n)&&!n.startsWith('checkpoint-')).map(n=>[n,hash(fs.readFileSync(path.join(output,n)))]));
        immutable(path.join(output,'checkpoint-'+String(previous.completed.size+1).padStart(4,'0')+'.json'),{id:entry.id,freezeSha256:state.freezeSha256,files,at:new Date().toISOString()});
        Object.assign(previous,verifiedRows(output,state.manifest));console.log(JSON.stringify({id:entry.id,completedPages:previous.completed.size,newGenerationCalls:0}));
    }} finally {await browser.close();}
    const verified=verifiedRows(output,state.manifest),aggregate=metrics(verified.rows,state.manifest),gate=require('./ac-testing-gate.cjs').paperGate(verified.rows,state.manifest.pages),summary={metrics:aggregate,rows:verified.rows,newGenerationCalls:0,liveSiteCalls:0,fixedPages:44,fixedSites:22,originalCandidates:40,paperGate:gate,paperUpdateAllowed:gate.paperUpdateAllowed};
    if(mode==='pilot')immutable(path.join(output,'pilot-checkpoint.json'),{freezeSha256:state.freezeSha256,ids:pilotPages.map(p=>p.id),checkpoints:checkpointFiles(output).map(f=>({file:f,sha256:hash(fs.readFileSync(path.join(output,f)))})),metrics:aggregate});
    immutable(path.join(output,mode+'-summary.json'),summary);return{output,mode,metrics:aggregate,paperGate:summary.paperGate,pilotAcceptanceSha256:mode==='pilot'?hash(fs.readFileSync(path.join(output,'pilot-checkpoint.json'))):null};
}
module.exports={hash,verifyFiles,assertPinned,verifyBaselineArtifact,productionBaseline,rowDiagnostics,runtimeIdentity,verifyRuntime,errorRow,sharedCompilation,executePolicies,outputDirectory,assertManifest,verifyEventPage,historicalInputs,preflight,prepare,verifyFreeze,verifiedRows,metrics,APPROACHES,PRODUCTION};
if(require.main===module){const mode=process.argv[2],tag=process.argv.find(s=>s.startsWith('--tag='))?.slice(6),acceptedPilot=process.argv.find(s=>s.startsWith('--accept-pilot='))?.slice(15);Promise.resolve().then(()=>mode==='preflight'?(()=>{const s=preflight();return{pages:s.manifest.pages.length,originalBindings:s.historicalBindingCount,inputs:Object.keys(s.inputs).length,newGenerationCalls:0};})():mode==='prepare'?prepare(tag):replay({tag,mode,acceptedPilot})).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
