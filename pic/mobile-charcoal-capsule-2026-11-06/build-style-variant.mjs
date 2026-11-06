// Pic-only style proposal. No imports from the application runtime.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const original=await readFile(path.resolve(here,'../mobile-web-pattern-2026-11-06/reference.html'),'utf8');
const result=original.replace('</style>','</style><link rel="stylesheet" href="style.css">')
  .replace('DESIGN PROPOSAL 01','DESIGN PROPOSAL 02')
  .replace('同一个工作区，更适合单手使用。','同样的 Lydia，新的视觉表达。')
  .replace('沿用 Web 的柔和底色、白色面板、淡紫选中态和彩色角色。<br>把三栏的职责重新组织到手机：会话首页 → 专注聊天 → 研究详情。','参考图一的悬浮胶囊导航，结合图二的炭灰、浅蓝与淡紫。<br>所有 Lydia 文案、专家、项目和资料保持上一稿内容。')
  .replace('与现有 Web 共用视觉语言','只调整视觉风格 · Lydia 内容保留')
  .replace('现有 Web 实际界面 · 视觉依据','现有 Web 实际界面 · 内容依据')
  .replace('01 / 保留 Web 的熟悉感','01 / 胶囊导航')
  .replace('角色、圆角面板、分组列表、分段控件和输入框保持同源。没有增加数据仪表盘或重新定义专家身份。','白色悬浮外壳，黑色选中胶囊。选中项显示名称，未选中项保留图标；仍然只有会话、项目、设置三个入口。')
  .replace('02 / 重新安排三栏的职责','02 / 炭灰与柔和彩色面板')
  .replace('左栏成为会话首页；中栏成为聊天主屏；右栏成为可展开详情。聊天内不放底部主导航，给内容和键盘留出空间。','深灰背景与圆角卡片承载内容，浅蓝和淡紫作为重点层。只借鉴参考图的视觉语言，不使用金融文案或数据。')
  .replace('03 / 手机专属的阅读节奏','03 / Lydia 内容保持')
  .replace('单一项目入口、44px 触控区域、16px 正文目标。设置采用纵向分组，研究页的四个标签在一屏内可见。','会话、角色、示例项目、资料、任务、语音与设置保持上一稿。旧版参考保留，正式应用没有修改。')
  .replace('06 · 深色聊天','06 · 浅蓝强调色对照')
  .replace('沿用现有深色 token，与浅色保持一致的层级。','同样的聊天内容，只对照浅蓝重点卡片。')
  .replace('style="background:#f5f5fa"','style="background:#2c2c2c"')
  .replace('style="background:#efedf9"','style="background:#e4f2f7"')
  .replace('style="background:#7565c9"','style="background:#e7def2"');
await writeFile(path.join(here,'reference.html'),result);
