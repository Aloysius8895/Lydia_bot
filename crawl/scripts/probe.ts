import {fetchPage} from '../fetch/http.ts';
import {parseETHGlobal,plain,links} from '../sources/ethglobal.ts';
import {writeFile,mkdir} from 'node:fs/promises';
const dir=new URL('../../data/.runtime/crawl/reports/probe/',import.meta.url);await mkdir(dir,{recursive:true});
for(const url of ['https://ethglobal.com/robots.txt','https://ethglobal.com/showcase','https://ethglobal.com/showcase/scalpless-15fnr']){
  try{const r=await fetchPage(url),name=new URL(url).pathname.split('/').at(-1)||'root';await writeFile(new URL(name+'.html',dir),r.bytes);
    console.log(JSON.stringify({url,status:r.statusCode,classification:r.classification,size:r.bytes.length,parsed:parseETHGlobal(url,r.bytes.toString('utf8')),text:plain(r.bytes.toString('utf8')).slice(0,1400),events:links(r.bytes.toString('utf8'),url).filter(a=>a.url.includes('/events/')).slice(0,8)}));
  }catch(e){console.log(JSON.stringify({url,error:(e as Error).message}));}
}
