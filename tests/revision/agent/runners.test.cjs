const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const {DeepSeekRunner,HTTPRunner,CodexRunner,LocalRunner,LOCAL}=require('../../../backend/agent/runners.cjs');const {ledger}=require('./helpers.cjs');
const messages=[{role:'system',content:'system'},{role:'user',content:'redacted'}];
const response=content=>new Response(JSON.stringify({id:'request-test',model:'served-model',usage:{prompt_tokens:10,completion_tokens:2},choices:[{finish_reason:'stop',message:{content}}]}),{status:200});
test('Flash off/on use existing key route, settings and guarded payload; direct generate is guarded too',async()=>{
 for(const thinking of [false,true]){const l=ledger();let body;const r=new DeepSeekRunner({apiKey:'test-key',thinking,ledger:l,fetchRequest:async(url,init)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');body=JSON.parse(init.body);assert.equal(l.totals().pending,1);return response('{"action":"query","selector":"main"}');}});const out=await r.generate(messages);assert.equal(out.requestId,'request-test');assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,thinking?'enabled':'disabled');assert.equal(body.reasoning_effort,thinking?'high':'none');assert.equal(l.totals().paidRequests,1);}
});
test('provider errors preserve reported usage, incomplete response fails, local config has no hidden model default',async()=>{
 assert.throws(()=>new HTTPRunner({}),/baseURL-and-model/);assert.throws(()=>new HTTPRunner({baseURL:'https://api.deepseek.com',model:'local'}),/local-runner/);
 const l=ledger();const r=new HTTPRunner({baseURL:'http://pc11:8000/v1',model:'future-local-model',ledger:l,fetchRequest:async(url)=>{assert.equal(url,'http://pc11:8000/v1/chat/completions');return response('local');}});assert.equal((await r.generate(messages)).content,'local');assert.equal(l.totals().paidRequests,0);
 const bad=new DeepSeekRunner({apiKey:'test',ledger:ledger(),fetchRequest:async()=>new Response(JSON.stringify({usage:{prompt_tokens:10,completion_tokens:20},choices:[{finish_reason:'length',message:{content:'{}'}}]}))});await assert.rejects(bad.generate(messages),e=>e.usage.completion_tokens===20);assert.equal(bad.ledger.totals().completionTokens,20);
});
test('Codex CLI adapter uses existing model/effort, stripped environment, extraction-only settings and JSON event usage',async()=>{
 let args,options,input;const l=ledger();const spawnProcess=(exe,a,o)=>{args=a;options=o;const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin.on('data',d=>{input=JSON.parse(d);});setImmediate(()=>{child.stdout.write(JSON.stringify({type:'thread.started',thread_id:'test-thread'})+'\n');child.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"action":"query","selector":"main"}'}})+'\n');child.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:5,cached_input_tokens:2}})+'\n');child.emit('close',0);});return child;};
 const r=new CodexRunner({executable:'fake-codex',ledger:l,spawnProcess});const result=await r.generate(messages);assert.equal(result.threadId,'test-thread');assert.deepEqual(input,messages);assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('gpt-6-luna'));assert.ok(args.includes('model_reasoning_effort="medium"'));assert.equal(options.shell,false);assert.ok(!('DEEPSEEK_API_KEY' in options.env));assert.equal(l.totals().paidRequests,0);assert.equal(l.totals().promptTokens,10);
});
test('development replay verifies frozen bytes and strips NOISE styles before jsdom CSS parsing',()=>{
 const fs=require('node:fs'),path=require('node:path');const {load}=require('../../../backend/agent/develop.cjs');const {hash}=require('../../../backend/agent/ledger.cjs');
 const l=ledger();const html='<html><head><style>.a{border:1px solid var(--border-color-progressive,#36c)}</style></head><body><main><h1>Frozen source</h1><p>Reading text</p></main></body></html>';
 const file=require('./helpers.cjs').registerPage(l,'style-test',html);const d=load('style-test',{registry:l.registry});
 assert.equal(d.window.document.querySelector('style'),null);assert.equal(d.removedNoiseStyles,1);assert.equal(d.window.document.querySelector('h1').textContent,'Frozen source');assert.equal(fs.readFileSync(file,'utf8'),html);d.window.close();fs.appendFileSync(file,'tampered');assert.throws(()=>load('style-test',{registry:l.registry}),/source-hash-mismatch/);
});
test('local runner uses exact section 4 settings, UTF-8 JSON and maximum four concurrent calls',async()=>{
 let active=0,peak=0;const l=ledger();const r=new LocalRunner({ledger:l,fetchRequest:async(url,init)=>{
  assert.equal(url,LOCAL.baseURL+'/chat/completions');assert.equal(init.headers.Authorization,'Bearer local');
  const body=JSON.parse(init.body);assert.equal(body.model,'Qwen3.8-27B-abliterated');assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.messages[1].content,'中文 café');
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return response('{}');
 }});assert.equal(r.timeoutMs,1800000);
 await Promise.all(Array.from({length:7},()=>r.generate([messages[0],{role:'user',content:'中文 café'}])));assert.equal(peak,4);assert.equal(l.totals().requests,7);assert.equal(l.totals().paidRequests,0);
});
test('local IP fallback is preflight-only; service-not-running errors are fatal and never retried',async()=>{
 const seen=[],r=new LocalRunner({ledger:ledger(),fetchRequest:async url=>{seen.push(url);if(url.includes('claude-host'))throw Object.assign(Error('DNS'),{cause:{code:'ENOTFOUND'}});return new Response(JSON.stringify({data:[{id:LOCAL.model}]}));}});
 await r.configure();assert.equal(r.endpoint,LOCAL.fallbackURL+'/chat/completions');assert.deepEqual(seen,[LOCAL.baseURL+'/models',LOCAL.fallbackURL+'/models']);
 let calls=0;const fatal=new LocalRunner({ledger:ledger(),fetchRequest:async()=>{calls++;return new Response('chat service is not running and would not start',{status:503});}});
 await assert.rejects(fatal.generate(messages),e=>e.fatal===true);assert.equal(calls,1);await assert.rejects(fatal.generate(messages),e=>e.fatal===true);assert.equal(calls,1);
 const preflight=new LocalRunner({ledger:ledger(),fetchRequest:async()=>new Response('would not start',{status:503})});await assert.rejects(preflight.configure(),e=>e.fatal===true);
});

test('native local transport tolerates delayed headers and sends library-serialized UTF-8 JSON',async()=>{
 const http=require('node:http');let received;
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);received=JSON.parse(Buffer.concat(chunks).toString('utf8'));setTimeout(()=>res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]})),80);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const r=new HTTPRunner({baseURL:'http://127.0.0.1:'+server.address().port,model:'fake',timeoutMs:1000,ledger:ledger()});
  assert.equal(r.fetchRequest,require('../../../backend/agent/local-http.cjs').localFetch);
  assert.equal((await r.generate([{role:'user',content:'中文 café'}])).content,'{}');assert.equal(received.messages[0].content,'中文 café');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('local outer timeout bounds delayed headers and body and retains the underlying abort cause',async()=>{
 const http=require('node:http');
 for(const phase of ['headers','body']){
  const server=http.createServer((req,res)=>{req.resume();if(phase==='body'){res.writeHead(200);res.write('{');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   const r=new HTTPRunner({baseURL:'http://127.0.0.1:'+server.address().port,model:'fake',timeoutMs:60,ledger:ledger()});
   // Node exposes the signal's DOMException (20) before headers and the
   // aborted IncomingMessage (ECONNRESET) while reading the response body.
   await assert.rejects(r.generate(messages),e=>e.message==='provider-timeout-or-abort'&&['20','ABORT_ERR','ECONNRESET'].includes(e.transportCause.code)&&/abort/i.test(e.transportCause.message));
   assert.equal(r.ledger.totals().pending,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
});

test('local transport refuses redirects before a second host or path is contacted',async()=>{
 const http=require('node:http');let calls=0;
 const server=http.createServer((req,res)=>{calls++;req.resume();res.writeHead(302,{Location:'http://127.0.0.1:1/forbidden'});res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const r=new HTTPRunner({baseURL:'http://127.0.0.1:'+server.address().port,model:'fake',ledger:ledger()});await assert.rejects(r.generate(messages),e=>e.transportCause.code==='LOCAL_REDIRECT_REFUSED');assert.equal(calls,1);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('LocalRunner succeeds against a length-required server with the exact UTF-8 byte count',async()=>{
 const http=require('node:http');let received;
 const server=http.createServer(async(req,res)=>{
  if(req.headers['transfer-encoding']||!req.headers['content-length']){req.resume();res.writeHead(411);res.end();return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const bytes=Buffer.concat(chunks);received={headers:req.headers,bytes};
  res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const endpoint='http://127.0.0.1:'+server.address().port+'/chat/completions';
  // Demonstrate this fixture rejects the old native request.write() framing.
  const status=await new Promise((resolve,reject)=>{const req=http.request(endpoint,{method:'POST'},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.write('{}');req.end();});
  assert.equal(status,411);
  const r=new LocalRunner({ledger:ledger()});r.endpoint=endpoint;
  const input=[{role:'user',content:'中文 café 🦉'}],body=JSON.stringify(r.payload(input));
  assert.equal((await r.generate(input)).content,'{}');
  assert.equal(Number(received.headers['content-length']),Buffer.byteLength(body,'utf8'));
  assert.ok(Buffer.byteLength(body,'utf8')>body.length);
  assert.equal(received.headers['transfer-encoding'],undefined);
  assert.equal(received.bytes.toString('utf8'),body);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('localFetch preserves caller Content-Length regardless of case, and frames an empty body',async()=>{
 const http=require('node:http'),{localFetch}=require('../../../backend/agent/local-http.cjs');const seen=[];
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);seen.push({headers:req.rawHeaders,body:Buffer.concat(chunks).toString('utf8')});res.end('{}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  for(const name of ['content-length','CONTENT-LENGTH','CoNtEnT-LeNgTh']){
   const headers={[name]:'02'};await (await localFetch(url,{method:'POST',headers,body:'{}'})).text();
   assert.deepEqual(headers,{[name]:'02'});const raw=seen.at(-1).headers;
   assert.equal(raw.filter(v=>v.toLowerCase()==='content-length').length,1);
   assert.equal(raw[raw.findIndex(v=>v.toLowerCase()==='content-length')+1],'02');
  }
  await (await localFetch(url,{method:'POST',body:''})).text();
  const raw=seen.at(-1).headers;assert.equal(raw[raw.findIndex(v=>v.toLowerCase()==='content-length')+1],'0');
  await (await localFetch(url)).text();assert.equal(seen.at(-1).headers.some(v=>v.toLowerCase()==='content-length'),false);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
