'use strict';
const policies=['P4-off','P4-on','P4-local'];
function point(summary,policy){const m=summary.policies?.[policy]?.measures;return m?{policy,clean:m.cleanPass.estimate,noise:m.noiseLeakage.estimate,recall:m.contentRecall.estimate}:null;}
function improves(a,b){return a.clean>=b.clean-1e-12&&a.noise<=b.noise+1e-12&&a.recall>=b.recall-1e-12&&(a.clean>b.clean+1e-12||a.noise<b.noise-1e-12);}
function assess(summary,previous={}){
 const candidates=policies.map(p=>point(summary,p)).filter(Boolean).sort((a,b)=>b.clean-a.clean||a.noise-b.noise);
 if(!candidates.length)throw Error('no-P4-scoreboard');
 const baselines=['P0','P1'].map(p=>point(summary,p));
 const baselineBest=baselines.filter(Boolean).sort((a,b)=>b.clean-a.clean||a.noise-b.noise)[0];
 const best=previous.best?.policy?.startsWith('P4')?previous.best:previous.current||baselineBest,current=candidates.find(p=>improves(p,best))||candidates[0],improved=improves(current,best),nonImproving=improved?0:(previous.nonImproving||0)+1;
 const target=candidates.some(p=>baselines.every(b=>b&&p.clean>b.clean+1e-12&&p.noise<b.noise-1e-12&&p.recall>=b.recall-1e-12));
 return {current,best:!previous.current||improved?current:best,improved,nonImproving,stop:nonImproving>=2,target,baselines};
}
module.exports={assess,improves};
