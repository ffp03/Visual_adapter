'use strict';
const {chromium}=require('playwright-core');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const origin='https://www.bbc.com';
  const robots=await fetch(`${origin}/robots.txt`,{headers:{'User-Agent':'VisualAdapterResearch/1.0 (public page capture)'}});
  if(!robots.ok&&robots.status!==404)throw Error(`robots.txt HTTP ${robots.status}`);
  if(robots.ok){const text=await robots.text();if(/^\s*Disallow:\s*\/news\s*$/im.test(text))throw Error('robots disallows /news');}
  await pause(3000);
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  try{const response=await page.goto(`${origin}/news`,{waitUntil:'load',timeout:45000});if(!response||response.status()>=400)throw Error(`navigation HTTP ${response?.status()}`);try{await page.waitForLoadState('networkidle',{timeout:15000})}catch{}
    const urls=await page.locator('a[href]').evaluateAll(as=>[...new Set(as.map(a=>new URL(a.href,location.href).href.split('#')[0]).filter(u=>/^https:\/\/www\.bbc\.com\/news\/articles\/[a-z0-9]+$/i.test(u)))]);
    console.log(JSON.stringify(urls.slice(0,30),null,2));
  }finally{await context.close();await browser.close()}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
