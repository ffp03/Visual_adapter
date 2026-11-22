const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');
const {Views,redact}=require('../../../backend/agent/outline.cjs');const {doc,close,pages,rule,prose}=require('./helpers.cjs');afterEach(close);
test('redacts emails, international/local phones, URL paths/credentials/query, handles and long digit runs',()=>{
 const raw='Ada a.person+lab@school.example +1 (705) 555-1234 020 7946 0958 https://user:pw@host.example/private/123?token=secret www.web.example/path @person 123456 12';
 const out=redact(raw);for(const secret of ['a.person','705','7946','user:pw','/private','token=','/path','@person','123456'])assert.ok(!out.includes(secret),out);
 assert.ok(out.includes('host.example'));assert.ok(out.includes('web.example'));assert.ok(out.includes('12'));
 assert.equal(redact('ftp://files.example/private wss://socket.example/private bare.example/private １２３４５６'),'files.example socket.example bare.example #');
});
test('stable page-local ids and depth expansion preserve source ids; queries limited to first five',()=>{
 const ds=pages(),views=new Views(ds);const initial=views.outline(1,undefined,1);const id=views.query('main')[0].matches[0].id;
 assert.ok(initial.outline.includes(`[${id}]`));assert.equal(views.outline(1,id,1).root,id);assert.equal(new Views(ds).query('main')[0].matches[0].id,id);assert.ok(views.query('p')[0].matches[0].repeat);
 const d=doc('<main>'+Array.from({length:10},(_,i)=>`<p>${prose(String(i))}</p>`).join('')+'</main>');assert.equal(new Views([d],{mode:'P3'}).query('p')[0].matches.length,5);
 assert.ok(!JSON.stringify(new Views([d],{mode:'P3'}).initial()).includes('repeat='));
});
test('cues are redacted before truncation, form values and noise never reach views, including descriptors',()=>{
 const d=doc(`<main id="private-123456" class="user@private"><h1>Title</h1><p>${prose('a@host.example https://host.example/secret @handle 123456')}</p><input value="formsecret"><textarea>areasecret</textarea><select><option>selectsecret</option></select><button value="buttonvalue">buttonsecret</button><script>scriptsecret</script><footer>footersecret</footer></main>`);
 for(const cueLength of [0,60,'full']){const v=new Views([d],{mode:'P3',cueLength});const json=JSON.stringify([v.initial(),v.query('main'),v.preview(rule())]);
 for(const secret of ['a@host','/secret','@handle','123456','formsecret','areasecret','selectsecret','buttonvalue','buttonsecret','scriptsecret','footersecret'])assert.ok(!json.includes(secret),secret);
 if(cueLength===0)assert.ok(v.query('p')[0].matches.every(m=>m.cue===''));else if(cueLength===60)assert.ok(v.query('p')[0].matches.every(m=>m.cue.length<=60));}
});
test('initial outlines capped at 8000 characters per page; full text cues share a 12000-character page budget',()=>{
 const d=doc('<main>'+Array.from({length:200},(_,i)=>`<p class="long-${i}">${prose(String(i)).repeat(3)}</p>`).join('')+'</main>');const v=new Views([d],{mode:'P3',cueLength:'full'});
 assert.ok(v.outline(1,undefined,4).outline.length<=8000);const p=v.preview(rule());assert.ok([...p.pages[0].output,...p.pages[0].missingUnique].reduce((s,b)=>s+b.cue.length,0)<=12000);assert.ok(p.pages[0].output.length<=40);assert.ok(!JSON.stringify(p).includes('<main'));
});
