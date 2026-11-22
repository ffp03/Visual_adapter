'use strict';
const phones=()=>/(?<![\p{L}\p{N}_])\+?\(?\p{Nd}{1,4}\)?(?:[ ().-]+\p{Nd}{1,8}\)?){1,7}(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])\+?\p{Nd}{7,15}(?![\p{L}\p{N}_])/gu;
const isPhone=raw=>{const count=[...raw.matchAll(/\p{Nd}/gu)].length;return count>=7&&count<=15;};
const urls=()=>/(?:(?:https?|ftp|wss?):\/\/|www\.)[^\s<>"']+|(?<![\p{L}\p{N}_])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d+)?[/?#][^\s<>"']*/giu;
const emails=()=>/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const digitRuns=()=>/\p{Nd}{3,}/gu;
function redact(value){return String(value??'').normalize('NFKC')
 .replace(urls(),raw=>{try{return new URL(/^[a-z]+:\/\//i.test(raw)?raw:'https://'+raw).hostname;}catch{return '[url]';}})
 .replace(emails(),'[email]').replace(phones(),raw=>isPhone(raw)?'[phone]':raw)
 .replace(/@[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu,'[handle]').replace(digitRuns(),'#');}
module.exports={redact,phones,isPhone,urls,emails,digitRuns};
