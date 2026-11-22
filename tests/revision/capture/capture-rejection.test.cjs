'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright-core');
const {capturePage}=require('./capture.cjs');
test('Chrome capture rejects a real navigation to root before writing a page', {timeout:45000}, async()=>{
 const requests=[];
 const server=http.createServer((req,res)=>{
  requests.push({url:req.url,at:Date.now()});
  if(req.url==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('User-agent: *\nAllow: /\n');}
  else if(req.url==='/products/example'){res.writeHead(302,{Location:'/'});res.end();}
  else {res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>Home page</h1>');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const id='test-l5-'+Date.now(),url='http://127.0.0.1:'+server.address().port+'/products/example';
 try{
  const result=await capturePage(browser,'dev',{id},url,0);
  assert.equal(result.rejected,true);assert.equal(result.errors[0].rule,'L5');
  await assert.rejects(fs.access(path.resolve(__dirname,'../../../workspace/revision/corpus/dev',id)),{code:'ENOENT'});
  const navigations=requests.filter(r=>['/robots.txt','/products/example','/'].includes(r.url));
  for(let i=1;i<navigations.length;i++)assert.ok(navigations[i].at-navigations[i-1].at>=2900,'same-host requests must be spaced by 3 seconds');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
