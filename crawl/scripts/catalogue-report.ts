import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {crawlStorageRoot} from '../../data/data_preprocessing/crawl/snapshots.ts';
const reportRoot=path.join(crawlStorageRoot,'reports'),names=await readdir(reportRoot);
const latest=(prefix:string)=>names.filter(n=>n.startsWith(prefix)).sort().at(-1);
const pilotName=latest('pilot-'),auditName=latest('source-audit-');
const pilot=pilotName?JSON.parse(await readFile(path.join(reportRoot,pilotName,'report.json'),'utf8')):null;
const audit=auditName?JSON.parse(await readFile(path.join(reportRoot,auditName,'audit.json'),'utf8')):null;
const relative=(p:string)=>path.relative(new URL('../reports/',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),p).split(path.sep).join('/');
const lines=['# 真实小样本与来源核查','',`生成时间：${new Date().toISOString()}。小样本不代表全站覆盖；未修改生产案件数据库。`,''];
if(pilot){lines.push(`- [原始 pilot 报告](${relative(path.join(reportRoot,pilotName!,'report.json'))})`,`- 系统：${pilot.operating_system}；Node ${pilot.node}；项目 ${pilot.project_count} 个；检索模式 ${(pilot.rag as any)?.mode||'unknown'}。`,'', '| 项目 | 来源 | 年份 | 质量 |','| --- | --- | --- | --- |');for(const p of pilot.projects)lines.push(`| [${p.title}](${p.url}) | ${p.url.includes('hackquest')?'HackQuest':'ETHGlobal'} | ${p.year??'未知，待核验'} | ${p.quality} |`);lines.push('','所有奖项/阶段未核验时保持 unknown；没有把 Grants、点赞数或项目创建时间当作获奖/赛事年份。','');for(const e of pilot.exports)lines.push(`- [${e.format} 导出 manifest](${relative(path.join(e.directory,'manifest.json'))})`);lines.push('',`公开实现资源检查：${pilot.resource_checks?.length||0} 条。状态与版本依据见原始报告；README blob 不代表赛事时 commit。`,'');}
if(audit){lines.push(`- [十站原始审核](${relative(path.join(reportRoot,auditName!,'audit.json'))})`,'','| 来源 | 入口/robots 实测状态 | 适配器 |','| --- | --- | --- |');for(const s of audit.sources)lines.push(`| ${s.name} | ${s.status}；robots HTTP ${s.robots?.status??'未取得'} | ${s.adapter_implemented?'已实现，范围见 pilot':'未实现'} |`);}
lines.push('','截图来自明确标记 TEST_ONLY 的浏览器测试，不冒充真实项目数据。','');await mkdir(new URL('../reports/',import.meta.url),{recursive:true});await writeFile(new URL('../reports/LATEST_LIVE_REPORT.md',import.meta.url),lines.join('\n'));console.log('Updated crawl/reports/LATEST_LIVE_REPORT.md');
