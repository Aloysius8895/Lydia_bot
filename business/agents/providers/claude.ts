import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert, AppError } from '../../shared/config.ts';

export type CliOptions={executable:string;workspace:string;timeout:number;noOverageConfirmed:boolean};
export function subscriptionEnv(original:NodeJS.ProcessEnv) {
  const env={...original};
  for(const key of Object.keys(env))if(/^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_API_KEY|CLAUDE_AGENT_SDK_)/.test(key)||key==='CLAUDE_CONFIG_DIR')delete env[key];
  return env;
}
export function cliArgs(schema?:unknown) {
  const args=['-p','--output-format','json','--permission-mode','dontAsk','--tools','','--disable-slash-commands','--no-session-persistence','--setting-sources','project','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--settings','{"disableAllHooks":true}'];
  if(schema)args.push('--json-schema',JSON.stringify(schema));
  return args;
}
export function parseResult(stdout:string,exitCode:number|null) {
  assert(exitCode===0,'CLI_PROCESS_FAILED','Claude CLI 进程未成功退出',503);
  let j:any;try{j=JSON.parse(stdout.trim());}catch{throw new AppError('CLI_OUTPUT_INVALID','CLI 未返回有效 JSON',503);}
  if(j.is_error===true||j.subtype!=='success'){
    const errorText=typeof j.result==='string'?j.result:JSON.stringify(j.errors||[]);
    if(/rate.?limit|usage.?limit|quota|exceed.*limit|hit.*limit/i.test(errorText))throw new AppError('CLI_QUOTA_EXHAUSTED','Claude 订阅额度受限；任务暂停，不切换 API 计费',503);
    if(/not.?logged|authenticat|login|credential|expired.*token/i.test(errorText))throw new AppError('CLI_AUTH_EXPIRED','Claude 登录失效，请通过官方 CLI 重新登录',503);
  }
  assert(j.type==='result'&&j.subtype==='success'&&j.is_error!==true,'CLI_RESULT_ERROR','CLI 返回错误或额度不足；未生成回答',503);
  if(j.structured_output)return {data:j.structured_output,usage:j.usage||null,session_id:j.session_id||null};
  let data:any;try{
    assert(typeof j.result==='string','CLI_SCHEMA_MISSING','CLI 未返回结构化答案',503);
    const text=j.result.trim(),fence=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    data=JSON.parse(fence?fence[1]:text);
  }catch{throw new AppError('CLI_SCHEMA_MISSING','CLI 未返回结构化答案',503);}
  return {data,usage:j.usage||null,session_id:j.session_id||null};
}
export class ClaudeCLI {
  options:CliOptions;
  private tail:Promise<void>=Promise.resolve();
  constructor(options:CliOptions){this.options=options;}
  async prepare(){
    await mkdir(this.options.workspace,{recursive:true});
    // No uploads, project instructions, user-configured tools or hooks are loaded in this workspace.
    await writeFile(path.join(this.options.workspace,'CLAUDE.md'),'Application-managed inference workspace. No file tools or shell tools are available. Follow the explicit task context.\n');
  }
  async process(args:string[],input:string,signal?:AbortSignal,timeout=this.options.timeout) {
    await this.prepare();
    return new Promise<{stdout:string;exit:number|null}>((resolve,reject)=>{
      if(signal?.aborted){reject(new AppError('CANCELLED','已取消',409));return;}
      let child:ChildProcess,stdout='',size=0,settled=false;
      const finish=(e?:Error,result?:{stdout:string;exit:number|null})=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);e?reject(e):resolve(result!);};
      const kill=()=>{
        if(!child?.pid)return;
        if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});
        else child.kill('SIGTERM');
      };
      const abort=()=>{kill();finish(new AppError('CANCELLED','已取消',409));};
      const timer=setTimeout(()=>{kill();finish(new AppError('CLI_TIMEOUT','Claude 调用超时；已保存进度',503));},timeout);
      try{child=spawn(this.options.executable,args,{cwd:this.options.workspace,env:subscriptionEnv(process.env),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}
      catch{finish(new AppError('CLI_NOT_FOUND','无法启动 Claude 可执行文件',503));return;}
      signal?.addEventListener('abort',abort,{once:true});
      child.stdout!.setEncoding('utf8');child.stdout!.on('data',(s:string)=>{size+=Buffer.byteLength(s);if(size>2*1024*1024){kill();finish(new AppError('CLI_OUTPUT_LIMIT','CLI 输出超过限制',503));}else stdout+=s;});
      // Do not log stderr: it may contain account metadata. Errors are classified below.
      child.stderr!.resume();
      child.once('error',()=>finish(new AppError('CLI_NOT_FOUND','无法启动 Claude CLI，请检查可执行文件路径',503)));
      child.once('close',code=>finish(undefined,{stdout,exit:code}));
      child.stdin!.on('error',()=>{});child.stdin!.end(input);
    });
  }
  async auth(){
    const r=await this.process(['auth','status','--json'],'',undefined,15000);
    let j:any;try{j=JSON.parse(r.stdout.trim());}catch{throw new AppError('CLI_AUTH_UNKNOWN','无法读取官方认证状态，请在本人终端运行 claude auth status',503);}
    const result={loggedIn:j.loggedIn===true,authMethod:j.authMethod,apiProvider:j.apiProvider,subscriptionType:j.subscriptionType};
    assert(r.exit===0&&result.loggedIn&&result.authMethod==='claude.ai'&&result.apiProvider==='firstParty'&&!!result.subscriptionType,'CLI_SUBSCRIPTION_REQUIRED','需要本人 Claude CLI 订阅登录；不接受 API/Console 计费',503);
    return result;
  }
  /** Number of callers holding or waiting for the single CLI slot (observability only). */
  inFlight=0;
  async run(prompt:string,schema:unknown,signal?:AbortSignal,hooks:{onStart?:()=>void|Promise<void>}={}){
    assert(this.options.noOverageConfirmed,'BILLING_CONFIRMATION_REQUIRED','请先确认官方账号额外用量已关闭，并在应用设置中记录确认',503);
    const previous=this.tail;let release!:()=>void;this.tail=new Promise<void>(r=>release=r);this.inFlight++;
    try{
      // Waiting may be abandoned, but the slot is only handed on after the previous holder finishes.
      await new Promise<void>((resolve,reject)=>{
        if(signal?.aborted){reject(new AppError('CANCELLED','已取消',409));return;}
        const abort=()=>reject(new AppError('CANCELLED','已取消',409));
        signal?.addEventListener('abort',abort,{once:true});
        previous.then(()=>{signal?.removeEventListener('abort',abort);resolve();});
      });
      assert(!signal?.aborted,'CANCELLED','已取消',409);
      await hooks.onStart?.();
      const auth=await this.auth();
      const structuredPrompt=`${prompt}\n\nReturn only JSON matching this schema, without Markdown or explanation. The application validates the returned data:\n${JSON.stringify(schema)}`;
      const r=await this.process(cliArgs(schema),structuredPrompt,signal);
      return {...parseResult(r.stdout,r.exit),auth};
    }finally{this.inFlight--;void previous.then(release);}
  }
}
