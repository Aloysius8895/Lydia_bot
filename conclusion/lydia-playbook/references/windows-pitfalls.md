# Windows 和工具链的坑

这台电脑是 Windows 11。Claude Code 同时提供 PowerShell 5.1 和 Git Bash 两种 shell。下面的坑每个都实际遇到过至少一次。

## Shell

| 坑 | 处理 |
| --- | --- |
| PowerShell 里 `npm` 被执行策略拦住（npm.ps1） | 一律写 `npm.cmd`。不改执行策略 |
| 用户的终端是 cmd.exe，`Stop-Process` 不存在 | 给 `taskkill /PID <pid> /F`；或者问清楚用户用的是哪个终端 |
| PowerShell 5.1 不支持 `&&`、`||`、三元运算符 | 用 `; if ($?) { … }` |
| Bash heredoc 里有反引号、引号、`|` 时解析失败（unexpected EOF），或者反斜杠被吃掉 | 复杂内容用 Write 工具写成脚本文件（.ts/.mjs/.py）再执行，不要在命令行里内联 |
| 后台命令里 `&` 把变量赋值也放进了后台 | 拆成几步，或写成脚本文件 |
| Python 打印中文崩溃（cp1252） | 设 `PYTHONIOENCODING=utf-8`，或者不打印中文 |
| `Set-Content` 默认用 ANSI 编码 | 写给其他工具读的文件加 `-Encoding utf8`，或者直接用 Write 工具 |
| `Restart-ScheduledTask` 不存在 | 先 `Stop-ScheduledTask` 再 `Start-ScheduledTask` |
| Git Bash 里进程替换 `<(…)` 配合 `git apply` 不工作 | 先写临时文件 |
| ESM 脚本顶层 `return` 报错 | 改成条件判断 |

## 换行符（git 开了 core.autocrlf=true）

- 工作区文件是 **CRLF**。用 Python 或 sed 做字符串替换时，先统一成 `\n`，替换完再还原成 CRLF；否则替换会静默失败（"nothing was written"）。优先用 Edit 工具。
- 生成 patch 用 `git diff --ignore-cr-at-eol`，否则整个文件都会被算成改动（2026-11-10：152 行的真实改动被显示成全文件改动）。
- 应用 patch 用 `patch -p0 --binary` 或 `git apply`。`patch` 返回码 2 可能只是没找到 `.orig` 文件，看实际结果判断。
- `git diff` 返回码 1 只表示"有差异"，不是出错。

## 网络和 TLS

| 坑 | 处理 |
| --- | --- |
| `npm install` 连 registry.npmjs.org 报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，每个包重试几分钟，总共卡半小时以上 | 这次命令里临时加 `--registry https://registry.npmmirror.com`（14 秒装完）。不要设 `strict-ssl=false`。全局改 registry 前先问用户 |
| Claude Code 沙盒里连不上 npm registry，安装一直挂着 | 停掉安装，告诉用户；尽量让代码在缺少可选依赖时也能运行（比如懒加载 SDK） |
| PowerShell 5.1 的 `Invoke-WebRequest` 访问 ts.net HTTPS 时握手失败 | 用 `curl.exe` |
| curl 访问 Tailscale IP 返回 403 | 服务会检查 Host，要用 ts.net 域名 |
| 刚启动时返回 503 | 应用还在初始化，等 10 秒重试 |

## 模块和路径

- 原型脚本放在 `pic/` 或 scratchpad 时，找不到 business 里安装的包（比如 zod、vite）。用 `createRequire(path.join(business,'package.json'))`，或者用绝对 `file://` 路径 import（`pathToFileURL(...)`）。模板 `assets/design-render-template.mjs` 已经这样处理了。
- 数据脚本要在 `C:\maven\business_agent\data` 目录下运行；应用脚本在 `business` 目录下运行。
- 路径里的反斜杠在 JS 字符串和 heredoc 里很容易出错。脚本里一律用正斜杠。

## Claude Code 自身

- **"Prompt is too long"**：原因是接的 MCP 工具太多（Blender、Canva、Lucid 等）加上大附件，而不是对话本身太长。处理：开新会话，第一句话限定范围（用户用过："本轮只处理 business/frontend。按需读取相关文件；业务 skills、expert-team 和研究资料本轮无需加载。"）；用 `/mcp` 关掉这个项目用不到的 MCP；不要附加 1.4 MB 的 HTML 或整个目录。
- 长对话会被压缩，压缩后的摘要可能缺细节。需要原文时去读 `C:\Users\User\.claude\projects\c--maven-business-agent\<会话>.jsonl`，或者用 `scripts/extract-transcripts.js` 提取。
- 后台任务完成后会通知你，不要轮询它的输出文件。

## 进程和端口

```powershell
Get-NetTCPConnection -State Listen -LocalPort 4317,4318,4319 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <pid> | Select-Object Id,StartTime,CPU
Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select-Object CommandLine
```

- 判断进程是不是卡死：隔 5 秒看两次 CPU。5 秒内涨了将近 5 秒，就是一个核心跑满了。
- `Get-NetTCPConnection` 没有结果时会报 exit code 1，意思是"这个端口没人监听"，不是出错。
