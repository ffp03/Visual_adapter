'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../../..');
const CORPUS=path.join(ROOT,'workspace/revision/corpus');
const siteData=[
  ['dev-01','blog.python.org','Blog'],['dev-02','books.toscrape.com','Commerce'],
  ['dev-03','developer.mozilla.org','Technical documentation'],['dev-04','en.wikipedia.org','Reference/collections'],
  ['dev-05','news.ycombinator.com','Discussion'],['dev-06','www.gov.uk','Government/public information'],
  ['dev-07','www.w3.org','Technical documentation'],['dev-08','www.bbc.com','News'],
  ['dev-09','www.keychron.com','Product pages'],['dev-10','discuss.ardupilot.org','Forum/Q&A threads'],
  ['dev-11','developer.chrome.com','Client-rendered site'],['dev-12','www.rfc-editor.org','Site without main/article markup']
];
const replaced=new Set(['dev-07-p2','dev-08-p1','dev-08-p2','dev-08-p3','dev-08-p4','dev-08-p5']);
async function main(){
  const sites=[];
  for(const [siteId,host,category] of siteData){
    const pages=[];
    for(let i=1;i<=5;i++){
      const pageId=`${siteId}-p${i}`,folder=path.join(CORPUS,'dev',siteId,pageId);
      const meta=JSON.parse(await fs.readFile(path.join(folder,'meta.json'),'utf8'));
      await fs.access(path.join(folder,'screenshot.png'));
      await fs.access(path.join(folder,'rendered-dom.html'));
      await fs.access(path.join(folder,'reference.json'));
      const flags={previouslyEvaluatedSite:false,newPage:true,heldOut:i>=3,clientRendered:meta.clientRendered};
      if(replaced.has(pageId)) flags.replacedOffHostPage=true;
      pages.push({pageId,url:meta.url,finalUrl:meta.finalUrl,sha256:meta.sha256,flags,capturedAt:meta.capturedAt});
    }
    sites.push({siteId,host,category,...(['dev-09','dev-10','dev-11','dev-12'].includes(siteId)?{harderDevelopmentSite:true}:{}),pages});
  }
  const manifest={schemaVersion:1,split:'dev',updatedAt:new Date().toISOString(),sites};
  const dest=path.join(CORPUS,'dev-manifest.json');
  await fs.writeFile(dest,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({sites:sites.length,pages:sites.reduce((n,s)=>n+s.pages.length,0),replacements:[...replaced]},null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
