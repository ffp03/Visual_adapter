const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),{once,EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {DeepSeekRunner}=require('../../backend/deepseek-runner.cjs'),{CodexRunner}=require('../../backend/codex-runner.cjs'),{modelInputText}=require('../../backend/model-evidence.cjs');
const rule={main:'main',exclude:[],name:'Synthetic evidence'},fixture='<h1 id=outside>Outside title</h1><main id=reading><article><h2>First entry</h2><p>Reading prose</p></article><article><h2>Second entry</h2><p>More reading</p></article><math aria-label="Actual math label"><mi>x</mi></math><audio aria-label="Actual audio label"></audio><video aria-label="Actual video label"></video><canvas aria-label="Actual chart label"></canvas><img alt="Actual image label"><svg aria-label="Actual vector label"></svg><input value="FORM_SECRET"><textarea>TEXTAREA_SECRET</textarea></main>';
async function context(html = fixture){
    const {chromium}=require('C:/Users/final/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    const browser=await chromium.launch({executablePath:'C:/Users/final/AppData/Local/Chromium/Application/chrome.exe',headless:true});
    const timer=setTimeout(()=>browser.close().catch(()=>{}),20000);
    try{const p=await browser.newPage();await p.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({status:200,contentType:'text/html',body:html}):r.abort());await p.goto('https://example.org/page',{waitUntil:'domcontentloaded',timeout:12000});
        await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../../extension/procedure-core.js'),'utf8')});
        await p.evaluate(()=>{window.__listeners=[];window.chrome={runtime:{sendMessage:async()=>({rules:[]}),onMessage:{addListener:fn=>window.__listeners.push(fn)}}}});
        await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../../extension/content.js'),'utf8')});
        return await p.evaluate(()=>new Promise(resolve=>window.__listeners[0]({action:'EXTRACT_CONTEXT'},{},resolve)));
    }finally{clearTimeout(timer);await browser.close()}
}
function background(...args){return require('./harness.cjs').background(...args)}
function createLocalServer(...args){return require('../../backend/local-ai.cjs').createLocalServer(...args)}
const directEvidence={schemaVersion:1,sourceCounts:{article:16,math:1,audio:1,image:1,svg:1},representedCounts:{article:13,math:1,audio:1,image:1,svg:1},locators:[{selector:'article',sourceMatches:16,representedMatches:13}]};
function codexStub(capture){return()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();let prompt='';child.stdin.on('data',chunk=>prompt+=chunk);child.stdin.on('finish',()=>{capture(prompt);child.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(rule)}})+'\n'+JSON.stringify({type:'turn.completed',usage:{input_tokens:1}})+'\n');setImmediate(()=>child.emit('close',0))});return child}}
test('actual content sketch represents distinct media/components and full-DOM locator collisions without form secrets',async()=>{const c=await context(),e=c.modelEvidence;assert.equal(e.schemaVersion,1);assert.equal(e.sourceCounts.article,2);assert(e.locators.some(x=>x.selector==='article'&&x.sourceMatches===2));assert.equal(e.sourceCounts.title,1);for(const kind of ['math','audio','video','canvas','image','svg']){assert.equal(e.sourceCounts[kind],1);assert.equal(e.representedCounts[kind],1)}assert(c.analysisHTML.includes('outside'));assert(c.analysisHTML.includes('Actual math label'));assert(!JSON.stringify(c).includes('FORM_SECRET'));assert(!c.analysisHTML.includes('TEXTAREA_SECRET'));assert(modelInputText(c.analysisHTML,e).length<=12000)});
test('BODY landmark attributes and CSS control-character locator witnesses remain accurate', async () => {
    const c = await context('<body role="main" id="a\nb"><p>Actual reading information.</p></body>');
    assert.equal(c.modelEvidence.sourceCounts.primary, 1);
    assert.equal(c.modelEvidence.representedCounts.primary, 1);
    const locator = c.modelEvidence.locators.find(item => item.selector === '[id="a\\a b"]');
    assert(locator, 'the emitted locator uses a CSS newline escape');
    assert.equal(locator.sourceMatches, 1);
    assert.equal(locator.representedMatches, 1);
});
test('background forwards explicit evidence as a field instead of DOM metadata',async()=>{const c=await context(),b=background();await b.analyze(c);assert.equal(b.calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(b.calls[0].body.modelEvidence)),JSON.parse(JSON.stringify(c.modelEvidence)))});
test('DeepSeek exact provider-bound data includes sanitized evidence through local server with total bound',async t=>{let sent;const runner=new DeepSeekRunner({apiKey:'fake-only',fetchRequest:async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(rule)}}]}))}});const directory=fs.mkdtempSync(path.resolve('workspace/task023/archive/2026-10-21-dom-evidence/server-'));const server=createLocalServer({directory,runner});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const c=await context(),response=await fetch('http://127.0.0.1:'+server.address().port+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hostname:'example.org',html:'<main><p>Reading</p><script>INJECTED_SCRIPT</script><input value="SERVER_SECRET"></main>'+' '.repeat(20000),modelEvidence:{...c.modelEvidence,unknownSecret:'OMITTED_SECRET'}})});assert.equal(response.status,200);const input=sent.messages.find(x=>x.role==='user').content;assert(input.startsWith('UNTRUSTED DOM EVIDENCE'));assert(input.includes('sourceMatches'));assert(input.includes('Actual')===false);assert(!input.includes('INJECTED_SCRIPT'));assert(!input.includes('SERVER_SECRET'));assert(!input.includes('OMITTED_SECRET'));assert(input.length<=12000);const ledger=fs.readFileSync(path.join(directory,'usage.jsonl'),'utf8');assert(!ledger.includes('Reading'));assert(!ledger.includes('sourceMatches'));runner.close()});
test('Codex exact stdin model-data section includes same bounded evidence using a stub child only',async()=>{const html='<main><math aria-label="Actual math"></math><audio aria-label="Actual audio"></audio></main>'+' '.repeat(20000);let prompt;const runner=new CodexRunner({executable:'not-executed',spawnProcess:codexStub(value=>prompt=value)});await runner.generate(html,directEvidence);const start=prompt.indexOf('UNTRUSTED DOM EVIDENCE'),input=prompt.slice(start);assert(start>0);assert.equal(input,modelInputText(html,directEvidence));assert(input.length<=12000);assert(input.includes('"math":1'));assert(input.includes('"article":16'));runner.close()});
test('DeepSeek exact outbound model-data section preserves bounded collision evidence without any DOM dependency',async()=>{let sent;const runner=new DeepSeekRunner({apiKey:'fake-only',fetchRequest:async(url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(rule)}}]}))}});const html='<main>Actual reading component</main>'+' '.repeat(20000);await runner.generate(html,directEvidence);const data=sent.messages.find(x=>x.role==='user').content;assert.equal(data,modelInputText(html,directEvidence));assert(data.length<=12000);assert(data.includes('"sourceMatches":16'));assert(data.includes('"math":1'));runner.close()});
test('optional evidence leaves legacy input route compatible and cannot silently exceed its new bound',()=>{assert.equal(modelInputText('<main>Legacy</main>'), 'HTML DATA:\n<main>Legacy</main>');const e={schemaVersion:1,sourceCounts:{article:16},representedCounts:{article:13},locators:Array.from({length:100},(_,i)=>({selector:'[id="'+('x'.repeat(200))+i+'"]',sourceMatches:16,representedMatches:13}))};const input=modelInputText('x'.repeat(40000),e);assert(input.length<=12000);assert(input.includes('"article":16'));assert.throws(()=>modelInputText('x',{schemaVersion:9}),/Unsupported/)});

test('v2 forwards evidence to both actual runner prompts and admits a second example without another generation', async t => {
    const { createHash } = require('node:crypto');
    for (const provider of ['deepseek', 'codex']) {
        let calls = 0, input;
        const runner = provider === 'deepseek'
            ? new DeepSeekRunner({ apiKey: 'fake-only', fetchRequest: async (_url, options) => {
                calls++; input = JSON.parse(options.body).messages.find(x => x.role === 'user').content;
                return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(rule) } }] }));
            } })
            : new CodexRunner({ executable: 'not-executed', spawnProcess: codexStub(prompt => {
                calls++; input = prompt.slice(prompt.indexOf('UNTRUSTED DOM EVIDENCE'));
            }) });
        const directory = fs.mkdtempSync(path.resolve('workspace/task023/archive/2026-10-21-dom-evidence/v2-'));
        const server = createLocalServer({ directory, runner, maxCalls: 1 });
        server.listen(0, '127.0.0.1'); await once(server, 'listening');
        t.after(() => { runner.close(); return new Promise(resolve => server.close(resolve)); });
        const post = async identity => {
            const html = '<main><h1>' + identity + '</h1><p>Distinct reading text for ' + identity + '</p></main>';
            const response = await fetch('http://127.0.0.1:' + server.address().port + '/analyze', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                    protocol: 2, hostname: 'example.org', exampleKey: createHash('sha256').update(identity).digest('hex'),
                    html, validationHTML: html, validationComplete: true, modelEvidence: directEvidence
                })
            });
            assert.equal(response.status, 200); return response.json();
        };
        assert.equal((await post('First example')).status, 'pending', provider);
        assert.equal(calls, 1, provider);
        assert(input.startsWith('UNTRUSTED DOM EVIDENCE'), provider);
        assert(input.includes('"sourceMatches":16'), provider);
        assert(input.length <= 12000, provider);
        assert.equal((await post('Second example')).status, 'admitted', provider);
        assert.equal(calls, 1, provider);
        const ledger = fs.readFileSync(path.join(directory, 'usage.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
        assert.equal(ledger.filter(x => x.event === 'started').length, 1, provider);
    }
});
