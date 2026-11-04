import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),command=args[0]||'help';
const option=(key:string,fallback?:string)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const help=`Lydia crawler CLI (API only; never opens PGlite)
Usage: node --experimental-strip-types crawl/cli.ts <command> [options]
  sources | runs | events | coverage [--run-id ID] | results [--status pending] [--source ID]
  projects [--year 2026] [--query text] [--offset 100]
  run [--source ethglobal] [--max-pages 5] [--seed https://...] [--config file.json]
  status <run-id> | pause <run-id> | resume <run-id> | cancel <run-id> | selection <run-id>
  project <project-id> | enrich <project-id> | import --case <case-id> --project <project-id>
  export --format json|csv|markdown | operation <operation-id> | health
  resume accepts --extend-budget to authorize one additional batch when exhausted.
  --origin http://127.0.0.1:4318
Login uses the existing Lydia password, entered invisibly in this terminal.
Automation may supply LYDIA_CRAWL_SESSION and LYDIA_CRAWL_CSRF via a private environment.
Requests retain Origin + session + CSRF protections. Never pass passwords as CLI arguments.`;
async function password(){
  if(!process.stdin.isTTY)throw Error('需要交互终端登录；无人值守可通过私有环境提供现有会话与 CSRF');
  process.stdout.write('Lydia password: ');process.stdin.setRawMode(true);process.stdin.resume();let value='';
  return new Promise<string>((resolve,reject)=>{const done=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');};const onData=(data:Buffer)=>{for(const ch of data.toString()){if(ch==='\r'||ch==='\n'){done();resolve(value);return;}if(ch==='\u0003'){done();reject(Error('Cancelled'));return;}if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' ')value+=ch;}};process.stdin.on('data',onData);});
}
async function main(){
  if(['help','--help','-h'].includes(command)){console.log(help);return;}
  const origin=new URL(option('origin','http://127.0.0.1:4318')!).origin;
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname)&&!origin.startsWith('https:'))throw Error('远程 CLI 连接必须使用 HTTPS');
  let cookie=process.env.LYDIA_CRAWL_SESSION?`crew_session=${process.env.LYDIA_CRAWL_SESSION}`:'',csrf=process.env.LYDIA_CRAWL_CSRF||'';
  const request=async(p:string,method='GET',data?:unknown)=>{const r=await fetch(origin+p,{method,headers:{origin,cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok)throw Error(`${j.error?.code}: ${j.error?.message}`);return {r,j};};
  if(!cookie){const login=await request('/api/auth/login','POST',{password:await password()});cookie=login.r.headers.get('set-cookie')!.split(';')[0];csrf=login.j.csrf;}
  let p='',method='GET',data:unknown;
  if(['sources','runs','health','events'].includes(command))p='/api/crawl/'+command;
  else if(command==='coverage')p='/api/crawl/coverage'+(option('run-id')?'?run_id='+encodeURIComponent(option('run-id')!):'');
  else if(command==='results'){const q=new URLSearchParams();for(const k of ['status','source'])if(option(k))q.set(k,option(k)!);p='/api/crawl/results?'+q;}
  else if(command==='projects'){const query=new URLSearchParams();for(const k of ['year','query','offset','source'])if(option(k))query.set(k,option(k)!);p='/api/crawl/projects?'+query;}
  else if(command==='run'){
    let config:any=option('config')?JSON.parse(await readFile(option('config')!,'utf8')):{sources:[option('source','ethglobal')],maxPages:Number(option('max-pages','5'))};
    if(option('rendering'))config.rendering=option('rendering');
    if(option('seed'))config.seeds=[{source:config.sources[0],url:option('seed')}];p='/api/crawl/runs';method='POST';data={config,request_key:randomUUID()};
  }else if(['status','pause','resume','cancel','selection'].includes(command)){if(!args[1])throw Error('缺少 run ID');p=`/api/crawl/runs/${encodeURIComponent(args[1])}${command==='status'?'':'/'+command}`;if(command!=='status'){method='POST';data=command==='resume'?{extend_budget:args.includes('--extend-budget')}:{};}}
  else if(command==='enrich'){if(!args[1])throw Error('?? project ID');p=`/api/crawl/projects/${encodeURIComponent(args[1])}/enrich`;method='POST';data={};}
  else if(['project','operation'].includes(command)){if(!args[1])throw Error('缺少 ID');p=`/api/crawl/${command==='project'?'projects':'operations'}/${encodeURIComponent(args[1])}`;}
  else if(command==='export'){p='/api/crawl/exports';method='POST';data={format:option('format','json'),request_key:randomUUID()};}
  else if(command==='import'){if(!option('case')||!option('project'))throw Error('需要 --case 与 --project');p=`/api/cases/${encodeURIComponent(option('case')!)}/crawl-imports`;method='POST';data={project_ids:[option('project')],request_key:randomUUID()};}
  else throw Error('Unknown command; use --help');
  console.log(JSON.stringify((await request(p,method,data)).j,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
