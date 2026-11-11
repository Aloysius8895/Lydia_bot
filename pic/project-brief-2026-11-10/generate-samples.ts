// Design-stage sample run: real source pages + real Claude CLI, no database access.
// Run from business/:  node --experimental-strip-types ../pic/project-brief-2026-11-10/generate-samples.ts
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ClaudeCLI} from '../../business/agents/providers/claude.ts';
import {config} from '../../business/shared/config.ts';
import {generateBrief} from './proposed/project-brief.ts';

const here=path.dirname(fileURLToPath(import.meta.url));
const cli=new ClaudeCLI({executable:config.cli,workspace:path.join(config.cliWorkspace,'design-brief'),timeout:config.cliTimeout,noOverageConfirmed:true});
const samples=[
 {title:'kalash',source_id:'ETHGlobal',meta:{imported_summary:'kalash connects temple donations in cash and USDC with digital stamp rallies and dedicated ATMs.',source_urls:['https://ethglobal.com/showcase/kalash-ipw8r','https://x.com/ETHGlobal/status/2119052112932053303']}},
 {title:'Takarabako',source_id:'ETHGlobal',meta:{imported_summary:'旅行剩余外币现金→可验证柜机→链上美元储蓄',imported_implementation:'树莓派柜机签名、ERC-4626/tkCASH储备证明、ENS v2、1inch Aqua、World ID',source_urls:['https://ethglobal.com/showcase/takarabako-qmgg5','https://x.com/ETHGlobal/status/2104115871883162007']}},
 {title:'Smart Water Guardian AI',source_id:'Hackster.io',meta:{source_urls:['https://www.hackster.io/david-kochoni/smart-water-guardian-ai-a194f1']}},
 {title:'Tokito',source_id:'Devfolio',meta:{source_urls:['https://devfolio.co/projects/tokito-2f44']}},
 {title:'SpoilSafe',source_id:'Microsoft Imagine Cup',meta:{source_urls:['https://techcommunity.microsoft.com/blog/studentdeveloperblog/introducing-the-2026-imagine-cup-world-finalists/4509670']}},
 {title:'True Deal',source_id:'TAIKAI',meta:{source_urls:['https://taikai.network/en/TokenNation/hackathons/Hackanation2026/projects/cmpve82kh02xkashyfzh6ko4c/idea']}},
];
const out:Record<string,unknown>={};
for(const p of samples){
 const start=Date.now();
 try{out[p.title]={...await generateBrief(cli,p),ms:Date.now()-start};}
 catch(e:any){out[p.title]={status:'failed',code:e?.code||'ERROR',message:e?.message,ms:Date.now()-start};}
 console.log(p.title,JSON.stringify(out[p.title]).slice(0,300));
}
await writeFile(path.join(here,'samples.json'),JSON.stringify({generated:new Date().toISOString(),artifact:'DESIGN_SAMPLES',samples:out},null,2));
