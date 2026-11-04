import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { hash } from '../../data/database/store.ts';
import { assert, AppError } from '../shared/config.ts';

export const roles={steve:'steve-blank-discovery',teresa:'teresa-torres-opportunity',april:'april-dunford-positioning',bob:'bob-moesta-demand',ash:'ash-maurya-lean-model',controller:'hackathon-gap-research'};
export type Role=keyof typeof roles;
export class Skills {
  root:string;
  constructor(root:string){this.root=root;}
  async load(role:Role){
    const files=['SKILL.md','references/methods.md'];
    if(role==='controller')files[1]='references/protocol.md';
    let root:string;try{root=await realpath(this.root);}catch{throw new AppError('SKILLS_MISSING','专家技能目录不存在；请恢复 business/skills',503);}
    const parts: {file:string;hash:string;content:string}[]=[];
    for(const file of files){
      const full=path.join(root,roles[role],file);let resolved:string;
      try{resolved=await realpath(full);}catch{throw new AppError('SKILL_FILE_MISSING',`${roles[role]}/${file} 不存在`,503);}
      const rel=path.relative(root,resolved);assert(rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel),'SKILL_PATH','技能路径越界');
      const content=await readFile(resolved,'utf8');assert(content.length<150000,'SKILL_SIZE','技能文件过大，需按需加载');
      parts.push({file:`${roles[role]}/${file}`,hash:hash(content),content});
    }
    return {root,role,mode:'EXPLICIT_CONTEXT_INJECTION',parts};
  }
  async status(){return Promise.all((Object.keys(roles) as Role[]).map(async role=>{try{const s=await this.load(role);return {root:s.root,role,status:'LOADED',mode:s.mode,files:s.parts.map(({file,hash})=>({file,hash}))};}catch(e){return {role,status:'BLOCKED',code:(e as any).code,message:(e as Error).message};}}));}
}
