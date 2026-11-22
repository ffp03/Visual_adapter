'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright-core');
const {capturePage}=require('./capture.cjs');
const {CORPUS,ARCHIVE,recordMove}=require('./corpus-maintenance.cjs');
const replacements={
 'dev-09-p2':'https://www.keychron.com/products/keychron-q2-max-qmk-via-wireless-custom-mechanical-keyboard',
 'dev-09-p3':'https://www.keychron.com/products/keychron-q3-max-qmk-via-wireless-custom-mechanical-keyboard',
 'dev-09-p4':'https://www.keychron.com/products/keychron-q4-pro-qmk-via-wireless-custom-mechanical-keyboard',
 'dev-09-p5':'https://www.keychron.com/products/keychron-q5-max-qmk-via-wireless-custom-mechanical-keyboard',
 'eval-38-p1':'https://www.weather.gov/safety/',
 'eval-39-p1':'http://info.cern.ch/hypertext/WWW/WhatIs.html',
 'eval-40-p1':'https://tldp.org/LDP/abs/html/why-shell.html',
 'eval-40-p2':'https://tldp.org/LDP/abs/html/sha-bang.html',
 'eval-40-p3':'https://tldp.org/LDP/abs/html/special-chars.html',
 'eval-40-p4':'https://tldp.org/LDP/abs/html/variables.html',
 'eval-40-p5':'https://tldp.org/LDP/abs/html/quoting.html'
};
async function run(ids) {
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const pageId of ids) {
   const url=replacements[pageId];if(!url)throw Error('unknown replacement '+pageId);
   const siteId=pageId.replace(/-p\d+$/,''),split=pageId.startsWith('dev')?'dev':'eval',index=Number(pageId.match(/-p(\d+)$/)[1])-1;
   const folder=path.join(CORPUS,split,siteId,pageId),archived=path.join(ARCHIVE,'replaced-captures',pageId);
   try{await fs.access(archived);}catch(e){if(e.code!=='ENOENT')throw e;await recordMove(folder,archived);}
   const result=await capturePage(browser,split,{id:siteId},url,index);
   if(result.rejected){await fs.appendFile(path.join(ARCHIVE,'capture-rejections.jsonl'),JSON.stringify({pageId,...result})+'\n');throw Error('capture rejected '+pageId+': '+result.reason);}
   console.log(JSON.stringify({pageId,url:result.meta.url,finalUrl:result.meta.finalUrl,title:result.meta.title,bytes:result.meta.bytes,screenshot:path.join(result.folder,'screenshot.png')}));
  }
 }finally{await browser.close();}
}
if(require.main===module)run(process.argv.slice(2)).catch(e=>{console.error(e.stack);process.exitCode=1});
