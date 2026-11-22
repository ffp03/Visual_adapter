'use strict';
// Node's native HTTP library has no Undici header/body deadline. The caller's
// AbortSignal governs the entire request, including delayed headers and body.
const http=require('node:http'),https=require('node:https'),{Readable}=require('node:stream');
function localFetch(input,{method='GET',headers={},body,signal}={}){
 const url=new URL(input);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('invalid-local-http-url');
 if(body!==undefined&&!Object.keys(headers).some(name=>name.toLowerCase()==='content-length'))headers={...headers,'Content-Length':Buffer.byteLength(body,'utf8')};
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).request(url,{method,headers,signal},response=>{
   // Never follow redirects or contact another host, including preflight.
   if(response.statusCode>=300&&response.statusCode<400){response.resume();reject(Object.assign(Error('provider-local-redirect-refused'),{code:'LOCAL_REDIRECT_REFUSED'}));return;}
   const status=response.statusCode,empty=[204,205,304].includes(status);
   if(empty)response.resume();
   resolve(new Response(empty?null:Readable.toWeb(response),{status,headers:response.headers}));
  });
  request.on('error',reject);if(body!==undefined)request.write(body,'utf8');request.end();
 });
}
module.exports={localFetch};
