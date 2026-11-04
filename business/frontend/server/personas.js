import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The distilled skills live next to the frontend: business/skills/<skill>/.
const here = path.dirname(fileURLToPath(import.meta.url));
export const SKILLS_DIR = process.env.CREW_SKILLS_DIR ?? path.resolve(here, '../../skills');

// ids must match the bot ids in src/data.js.
export const personas = [
  { id: 'steve', name: 'Steve Blank', skill: 'steve-blank-discovery' },
  { id: 'ash', name: 'Ash Maurya', skill: 'ash-maurya-lean-model' },
  { id: 'teresa', name: 'Teresa Torres', skill: 'teresa-torres-opportunity' },
  { id: 'april', name: 'April Dunford', skill: 'april-dunford-positioning' },
  { id: 'bob', name: 'Bob Moesta', skill: 'bob-moesta-demand' },
];

export const personasById = Object.fromEntries(personas.map((p) => [p.id, p]));

// SKILL.md points at these by relative link; there is no file tool in chat, so they are inlined.
const REFERENCES = ['methods.md', 'cases.md', 'source-index.md'];

const CHAT_RULES = `## 运行环境（Crew 聊天应用）

你正在 Crew 聊天界面里以上述方法角色回复用户。本环境的实际情况：
- 上面的 SKILL.md 与 references 已全部加载，不需要也无法再读取文件。
- 本次没有联网、文件写入或任何工具。技能要求联网核实时，按技能规定写 NOT_ATTEMPTED 并说明原因，不用记忆冒充采集结果。
- 没有共享案件目录与证据台账；用户在对话里给出的材料就是唯一可读材料。不要编造 E 编号证据。
- 在群聊里，其他角色的发言以「[名字]: 」开头；可以回应或补充，但只承担自己的职责，不替其他角色作答。
- 用用户使用的语言回复。这是聊天气泡：先给结论，再给依据和下一步；可用短段落和「- 」列表，不用 Markdown 标题、表格或粗体。普通问题控制在 300 字以内，用户要求详细输出时再展开。`;

// Read on every request so edits to the skill files apply without a restart.
export function systemPrompt(id) {
  const persona = personasById[id];
  const dir = path.join(SKILLS_DIR, persona.skill);
  const parts = [fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')];
  for (const file of REFERENCES) {
    const full = path.join(dir, 'references', file);
    if (fs.existsSync(full)) parts.push(`<reference path="references/${file}">\n${fs.readFileSync(full, 'utf8')}\n</reference>`);
  }
  parts.push(CHAT_RULES);
  return parts.join('\n\n');
}
