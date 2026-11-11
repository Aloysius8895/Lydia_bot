import {randomUUID} from 'node:crypto';
import type {Store} from '../../data/data_preprocessing/database/store.ts';

export async function seedKnowledge(store:Store,count=18){
 const run=randomUUID(),task=randomUUID(),snapshot=randomUUID();
 await store.db.query("INSERT INTO crawl_runs(id,request_key,config,status) VALUES($1,$2,'{}','completed')",[run,'TEST_ONLY-'+run]);
 await store.db.query("INSERT INTO crawl_tasks(id,run_id,source_id,kind,url,idempotency_key,status) VALUES($1,$2,'ethglobal','page','https://example.com/test',$3,'succeeded')",[task,run,task]);
 await store.db.query("INSERT INTO crawl_snapshots(id,task_id,requested_url,final_url,status_code,headers,content_type,classification,sha256,blob_path,byte_length,backend,captured_at) VALUES($1,$2,'https://example.com/test','https://example.com/test',200,'{}','text/html','readable',$3,'TEST_ONLY',100,'TEST_ONLY',now())",[snapshot,task,'a'.repeat(64)]);
 const names=['CampusFlow','QueueLens','MeetMesh','Open Clinic','Carbon Atlas','Field Notes','Safe Harbor','Team Beacon','Waterline','Signal Garden','Care Bridge','Study Loop'];
 const list=[];
 for(let i=0;i<count;i++){
  const id=randomUUID(),version=randomUUID(),title='TEST_ONLY '+names[i%names.length]+(i>=names.length?' '+i:'');
  const content='TEST_ONLY project coordinates shared capacity. '+title+' explores scheduling and live signals for small teams. This is synthetic test content, not real market evidence.';
  await store.db.query("INSERT INTO crawl_projects(id,source_id,native_id,title,url,meta) VALUES($1,$2,$3,$4,$5,$6)",[id,['ethglobal','hackquest','devfolio'][i%3],id,title,'https://example.com/'+id,{year:2026,synthetic:true}]);
  await store.db.query("INSERT INTO crawl_project_versions(id,project_id,snapshot_id,content,content_hash,parser_version) VALUES($1,$2,$3,$4,$5,'TEST_ONLY')",[version,id,snapshot,content,id]);
  await store.db.query('UPDATE crawl_projects SET current_version_id=$2 WHERE id=$1',[id,version]);
  list.push({id,title,content,revision:1,current_version_id:version});
 }
 return list;
}
export function knowledgeReply(projects:any[]){
 const ids=projects.slice(0,3).map(p=>p.id);
 return {
  commonalities:[{statement:'这些示例都在协调有限资源与实时信号。',project_ids:ids,quotes:ids.map(id=>({project_id:id,quote:'project coordinates shared capacity.'}))}],
  differences:[{statement:'示例名称不同，真实实现差异仍需补充资料。',project_ids:[ids[0]],quotes:[{project_id:ids[0],quote:'This is synthetic test content, not real market evidence.'}]}],
  limitations:['TEST_ONLY：使用构造样本验证流程，不代表模型真实表现或市场需求。'],
  ideas:['校园服务协调台','临时活动流量助手','共享设备预约员'].map(title=>({title,summary:'把预约、现场队列和团队交接整合到一个轻量工具中。',users:'小型校园服务团队',source_project_ids:ids,difference:'将分散的流程组合成一个可演示的场景。',fit:'在指定的 48 小时内先展示一条核心流程。',mvp:'预约与排队的单场景演示。',assumptions:['用户愿意维护实时状态，尚待验证。'],first_test:'观察一个服务台，记录预约与排队交接。',news_angle:projects.some(p=>p.kind==='news')?'把测试报道中的服务容量线索，与项目的预约协调机制结合；不是需求已验证。':''}))
 };
}
