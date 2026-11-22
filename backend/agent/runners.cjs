'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { sharedKey, MODEL } = require('../deepseek-runner.cjs');
const { childEnvironment, MODEL: CODEX_MODEL, EFFORT: CODEX_EFFORT } = require('../codex-runner.cjs');
const { Ledger, isAuthorized } = require('./ledger.cjs');

class HTTPRunner {
    constructor({ baseURL, model, apiKey = '', fetchRequest = fetch, timeoutMs = 60000, maxTokens = 4096, ledger, provider = 'pc11' } = {}) {
        if (!baseURL || !model) throw Error('baseURL-and-model-required');
        const url = new URL(baseURL);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('invalid-baseURL');
        // Paid public providers must never be disguised as the future local model.
        if (provider !== 'deepseek' && /(?:^|\.)(?:deepseek\.com|openai\.com)$/i.test(url.hostname)) throw Error('local-runner-requires-local-provider');
        this.endpoint = baseURL.replace(/\/$/, '') + '/chat/completions'; this.model = model; this.apiKey = apiKey;
        this.provider = provider; this.fetchRequest = provider==='pc11'&&fetchRequest===fetch?require('./local-http.cjs').localFetch:fetchRequest; this.timeoutMs = timeoutMs; this.maxTokens = maxTokens;
        this.ledger = ledger || new Ledger(); this.controllers = new Set();
    }
    payload(messages) { return { model: this.model, max_tokens: this.maxTokens, response_format: { type: 'json_object' }, stream: false, messages }; }
    async generate(messages, context) {
        if (!isAuthorized(context)) return this.ledger.run(this, messages);
        // LocalRunner may have awaited a concurrency slot since dispatch.
        context.checkDeadline?.();
        const controller = new AbortController(); this.controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let metadata = {};
        try {
            const response = await this.fetchRequest(this.endpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: 'Bearer ' + this.apiKey } : {}) },
                body: JSON.stringify(context.payload) });
            metadata.requestId = response.headers?.get('x-request-id') || null;
            const chunks = []; let size = 0;
            for await (const chunk of response.body) {
                size += chunk.length;
                if (size > 262144) { controller.abort(); throw Error('provider-response-too-large'); }
                chunks.push(chunk);
            }
            const raw=Buffer.concat(chunks).toString('utf8');
            if(this.provider==='pc11' && /chat service is not running|would not start/i.test(raw))throw Object.assign(Error('provider-local-service-not-running'),{fatal:true});
            if(!response.ok)throw Error('provider-http-'+response.status);
            const data = JSON.parse(raw);
            metadata = { requestId: metadata.requestId || data.id || null, usage: data.usage || null, servedModel: data.model || null };
            const choice = data.choices?.[0];
            if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim() || choice.message.tool_calls?.length) throw Error('provider-incomplete-action');
            return { content: choice.message.content, ...metadata };
        } catch (error) {
            const safe = Error(controller.signal.aborted ? 'provider-timeout-or-abort' : /^provider-/.test(error.message) ? error.message : 'provider-request-failed');
            Object.assign(safe, metadata,{fatal:!!error.fatal,transportFailure:/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(error.cause?.code||error.code||'')});
            if(this.provider==='pc11'){
                const cause=error.cause||error;safe.transportCause={code:String(cause.code||error.code||error.name||'Error'),message:String(cause.message||error.message).slice(0,2048)};
            }
            throw safe;
        } finally { clearTimeout(timer); this.controllers.delete(controller); }
    }
    close() { for (const controller of this.controllers) controller.abort(); }
}
class DeepSeekRunner extends HTTPRunner {
    constructor({ thinking = false, apiKey = sharedKey(), ...options } = {}) {
        super({ ...options, baseURL: 'https://api.deepseek.com', model: MODEL, apiKey, provider: 'deepseek' });
        this.thinking = thinking; this.effort = thinking ? 'high' : 'none';
    }
    payload(messages) { return { ...super.payload(messages), thinking: { type: this.thinking ? 'enabled' : 'disabled' }, reasoning_effort: this.effort }; }
}
const LOCAL = Object.freeze({baseURL:'http://claude-host:8780/v1',fallbackURL:'http://100.106.192.82:8780/v1',model:'Qwen3.8-27B-abliterated',apiKey:'local',timeoutMs:1800000,concurrency:4});
const localSlots={active:0,queue:[]};
async function acquireLocal(){if(localSlots.active>=4)await new Promise(resolve=>localSlots.queue.push(resolve));else localSlots.active++;}
function releaseLocal(){const next=localSlots.queue.shift();if(next)next();else localSlots.active--;}
class LocalRunner extends HTTPRunner {
    constructor(options={}) {
        super({...options,baseURL:LOCAL.baseURL,model:LOCAL.model,apiKey:LOCAL.apiKey,timeoutMs:LOCAL.timeoutMs,provider:'pc11'});
        this.effort='thinking-disabled';this.fatal=false;
    }
    payload(messages){return {...super.payload(messages),chat_template_kwargs:{enable_thinking:false}};}
    async configure({checkDeadline=()=>{}}={}){
        for(const [i,base] of [LOCAL.baseURL,LOCAL.fallbackURL].entries()){
            try{
                checkDeadline();
                const response=await this.fetchRequest(base+'/models',{headers:{Authorization:'Bearer local'},redirect:'error',signal:AbortSignal.timeout(LOCAL.timeoutMs)});
                const raw=await response.text();
                if(/chat service is not running|would not start/i.test(raw))throw Object.assign(Error('provider-local-service-not-running'),{fatal:true});
                if(!response.ok)throw Error('local-preflight-http-'+response.status);
                const data=JSON.parse(raw);
                if(!data.data?.some(m=>m.id===LOCAL.model))throw Error('local-model-not-advertised');
                this.endpoint=base+'/chat/completions';return {endpoint:this.endpoint,model:this.model};
            }catch(error){
                const cause=error.cause||error;
                error.transportCause={code:String(cause.code||error.code||error.name||'Error'),message:String(cause.message||error.message).slice(0,2048)};
                if(error.fatal){this.fatal=true;throw error;}
                // IP fallback is route selection before generation, never a
                // replay of a request whose outcome is unknown.
                const connection=/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(error.cause?.code||error.code||'');
                if(i!==0 || !connection)throw error;
            }
        }
    }
    async generate(messages,context){
        if(!isAuthorized(context))return this.ledger.run(this,messages);
        if(this.fatal)throw Object.assign(Error('provider-local-service-not-running'),{fatal:true});
        await acquireLocal();
        try{
            if(this.fatal)throw Object.assign(Error('provider-local-service-not-running'),{fatal:true});
            return await super.generate(messages,context);
        }catch(error){if(error.fatal){this.fatal=true;this.close();}throw error;}
        finally{releaseLocal();}
    }
}
function executable() {
    if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
    if (process.platform !== 'win32') return 'codex';
    const binary = path.join(process.env.APPDATA || '', 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
    if (!fs.existsSync(binary)) throw Error('Set CODEX_BIN to the installed codex.exe path.');
    return binary;
}
function stop(child) {
    if (!child.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID',String(child.pid),'/T','/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid,'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}
class CodexRunner {
    constructor({ ledger, executable: binary = executable(), timeoutMs = 60000, spawnProcess = spawn } = {}) {
        this.ledger = ledger || new Ledger(); this.executable = binary; this.timeoutMs = timeoutMs; this.spawnProcess = spawnProcess;
        this.provider = 'codex'; this.model = CODEX_MODEL; this.effort = CODEX_EFFORT;
        this.cwd = path.join(this.ledger.payloadDirectory, 'codex-runtime'); fs.mkdirSync(this.cwd,{recursive:true}); this.children = new Set();
    }
    checkLogin() {
        const status = spawnSync(this.executable, ['login','status'], { env: childEnvironment(), encoding:'utf8', timeout:10000, windowsHide:true });
        if (status.status !== 0 || !/using ChatGPT/i.test((status.stdout || '') + (status.stderr || ''))) throw Error('Codex ChatGPT login required');
    }
    payload(messages) { return { model:this.model, effort:this.effort, messages }; }
    async generate(messages, context) {
        if (!isAuthorized(context)) return this.ledger.run(this,messages);
        const args = ['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--model',this.model,'--json','--cd',this.cwd];
        for (const setting of [`model_reasoning_effort="${this.effort}"`,'forced_login_method="chatgpt"','approval_policy="never"',
            'project_doc_max_bytes=0','features.shell_tool=false','features.multi_agent=false','features.apps=false','web_search="disabled"']) args.push('-c',setting);
        args.push('-');
        // Same extraction-only CLI route and credential allowlist as codex-runner;
        // JSON messages preserve the uniform action protocol instead of v2 schema.
        return new Promise((resolve,reject) => {
            const child = this.spawnProcess(this.executable,args,{cwd:this.cwd,env:childEnvironment(),shell:false,windowsHide:true,detached:process.platform !== 'win32',stdio:['pipe','pipe','pipe']});
            this.children.add(child); const decoder = new StringDecoder('utf8');
            let buffer='', content='', usage=null, threadId=null, completed=false, failure=null, size=0;
            const fail = reason => { failure ||= Error(reason); stop(child); };
            const timer = setTimeout(() => fail('codex-timeout'),this.timeoutMs);
            const consume = line => {
                let e; try { e=JSON.parse(line); } catch { return; }
                if(e.type==='thread.started') threadId=e.thread_id;
                if(e.type==='turn.completed') { usage=e.usage || null; completed=true; }
                if(e.type==='turn.failed' || e.type==='error') fail('codex-turn-failed');
                if(e.item?.type==='agent_message') content=e.item.text;
                if(e.item && !['agent_message','reasoning'].includes(e.item.type)) fail('codex-unexpected-tool-activity');
            };
            child.stdout.on('data',chunk => {
                size+=chunk.length; if(size>262144) return fail('codex-output-bound'); buffer+=decoder.write(chunk);
                let n; while((n=buffer.indexOf('\n'))>=0) { consume(buffer.slice(0,n)); buffer=buffer.slice(n+1); }
            });
            child.stderr.on('data',()=>{}); child.stdin.on('error',()=>fail('codex-input-failed'));
            child.on('error',()=>{failure ||= Error('codex-launch-failed');});
            child.on('close',code => {
                clearTimeout(timer);this.children.delete(child);buffer+=decoder.end();if(buffer.trim())consume(buffer);
                if(failure || code!==0 || !completed || !content) return reject(Object.assign(failure || Error('codex-incomplete-action'),{usage,requestId:threadId}));
                resolve({content,usage,threadId,servedModel:this.model});
            });
            child.stdin.end(JSON.stringify(context.payload.messages));
        });
    }
    close() { for(const child of this.children)stop(child); }
}
module.exports = { HTTPRunner, OpenAICompatibleRunner: HTTPRunner, DeepSeekRunner, CodexRunner,LocalRunner,LOCAL };
