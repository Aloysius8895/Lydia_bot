# 部署、运维和排障

## 目录

1. 三种运行方式（只能同时开一种）
2. 部署步骤（已验证）
3. 怎么确认线上真的是新版本
4. 回答"怎么启动"
5. 手机和平板接入
6. 排障对照表
7. 日志和状态在哪

## 1. 三种运行方式（只能同时开一种）

| 方式 | 怎么开 | 谁能打开 | 现状 |
| --- | --- | --- | --- |
| **远程（默认）** | Windows 登录时，计划任务 `Lydia Remote` 自动启动；手动用 `Start-ScheduledTask -TaskName 'Lydia Remote'` 或双击 `business\Start-Lydia-Remote.cmd` | 登录用户 Tailscale 账号的设备，用 `https://<电脑名>.<tailnet>.ts.net:4318`（实际地址在 `business\.runtime\remote\address.txt`）。2026-11-11 起免密码 | 平时一直开着 |
| 本机 | `business\Start-Lydia.cmd` 或 `cd business; npm.cmd start` | 只有这台电脑：`http://127.0.0.1:4318` | 远程模式开着时不要用 |
| 局域网手机 | `business\Start-Lydia-Phone.cmd`（HTTPS，本地 CA 证书） | 同一个 Wi-Fi 下的手机 | 已被 Tailscale 取代，**不要再开** |

**为什么只能开一种**：PGlite 只能单进程打开。2026-11-10 局域网模式和远程模式同时开着，打开了同一个库，远程后端一个 CPU 核心跑满，所有请求都超时。结束进程后，启动器在 30 秒内重新拉起了后端，问题消失。

远程模式只绑定 Tailscale IP，所以电脑上打开 `127.0.0.1:4318` 是打不开的，电脑也要用 ts.net 地址。说这件事时别说错（2026-11-10 说错过一次）。

## 2. 部署步骤（已验证）

前提：界面改动用户已经确认过，或者是用户要求的修复。**避开 10:00 前后**：每日导入会停掉并重启服务。

```powershell
# 0. 确认没有正在跑的 Claude 调用，否则重启会打断用户的研究任务
Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | Select-Object ProcessId,ParentProcessId,CreationDate
#    父进程是 Lydia 后端的 claude.exe 还在跑，就等它结束。用户自己的 Claude Code 会话不用管

# 1. 停服务（普通 PowerShell 就行，不需要管理员）
Stop-ScheduledTask -TaskName 'Lydia Remote'
Get-NetTCPConnection -State Listen -LocalPort 4317,4318 -ErrorAction SilentlyContinue   # 应该为空

# 2. 备份（有迁移或要写库时必须做；4318 还在监听时工具会拒绝运行）
cd C:\maven\business_agent\data
node --experimental-strip-types data_preprocessing/cli/backup-for-import.ts --db data_storage/database --destination data_storage/backups/database
#    打开它输出的 manifest.json，确认 verified 和 restore_verified 都是 true

# 3. 构建前端（只改了后端就跳过）
cd C:\maven\business_agent\business
npm.cmd run build:frontend

# 4. 启动（新迁移会在启动时自动执行）
Start-ScheduledTask -TaskName 'Lydia Remote'
```

然后按第 3 节验证。

注意：
- 前 10 秒左右返回 503 是正常的：端口先开始监听，应用还在初始化。重试几次再判断。
- `Start-ScheduledTask` 偶尔不生效，任务停在 Ready、端口没人监听。多半是 Stop 还没结束就 Start 了。轮询端口；60 秒内还没起来，再 Start 一次。
- 研究任务在停服务时会保存 checkpoint，重启后显示"暂停"，用户点"恢复此任务"就能接着跑。
- 停服期间手机打不开。汇报里写停了多久（通常约 1 分钟）。
- 只改了 `data/data_preprocessing` 里每日导入用的代码（例如 parse.ts），不用重启：每日任务是单独起的进程，下次运行就用新代码。

## 3. 怎么确认线上真的是新版本

```powershell
$url = (Get-Content C:\maven\business_agent\business\.runtime\remote\address.txt -Raw).Trim()
curl.exe -s -o NUL -w "%{http_code}`n" $url                # 应该是 200
curl.exe -s $url | Select-String -Pattern 'assets/index-[^"]+\.js' -AllMatches | ForEach-Object { $_.Matches.Value }
# 和 business\frontend\dist\index.html 里的 assets/index-*.js 名字一致，才说明新构建已经生效
```

- PowerShell 5.1 的 `Invoke-WebRequest` 默认 TLS 版本太旧，握手会失败，所以用 `curl.exe`。
- 返回 403 说明服务对 Host 有校验，要用配置的 ts.net 域名访问，不能直接用 IP。
- 返回 401 是没登录时访问业务接口的正常结果，不是故障。
- 也可以直接跑 `conclusion\lydia-playbook\scripts\lydia-status.ps1`。

## 4. 回答"怎么启动"

1. 先跑状态检查。服务多半已经在跑。
2. 在跑：直接给 ts.net 链接，说明电脑要开着、联网、不睡眠（锁屏可以），手机要连上 Tailscale。
3. 没跑：`Start-ScheduledTask -TaskName 'Lydia Remote'`，或者双击 `Start-Lydia-Remote.cmd`。黑色窗口不能关。
4. 告诉用户不要再双击 `Start-Lydia.cmd` 或 `Start-Lydia-Phone.cmd`，因为会和远程实例冲突。
5. 首次在新电脑上装：`business` 和 `data` 两个目录各跑一次 `npm.cmd ci`；`claude auth login`；Ollama 要有 `nomic-embed-text:latest`。

## 5. 手机和平板接入

1. 安装 Tailscale（App Store 或 Google Play，开发者是 Tailscale Inc.）。
2. 用**和电脑同一个账号、同一种登录方式**登录。登录方式不同，即使邮箱一样也可能进到另一个 tailnet。
3. 允许添加 VPN 配置，打开开关，状态应显示 Connected，设备列表里能看到电脑。
4. 用 Safari/Chrome 打开 ts.net 地址，然后"添加到主屏幕"。以前用局域网 IP 加的图标要删掉，它们不会自动换地址。
5. 在电脑上运行 `& "C:\Program Files\Tailscale\tailscale.exe" status`，能看到手机就说明已接入。
6. 常见问题：
   - 登录了不同账号。
   - 显示 Needs approval：去 Tailscale 后台的 Machines 页面批准。
   - 省电模式断开了 VPN，或者开了别的 VPN。
   - 电脑睡眠了。
- 用户问"还要连同一个网吗"：远程模式不用，用流量也行。只有局域网模式需要同一个 Wi-Fi。

## 6. 排障对照表

| 现象 | 先查 | 根因和处理 |
| --- | --- | --- |
| 启动报"应用启动失败；请检查本地依赖与端口" | `Get-NetTCPConnection -LocalPort 4318` 看谁占着 | 通用 catch 把真实错误吞掉了。直接调用 `main()` 能看到真实异常，多半是 `EADDRINUSE`，也就是已经有实例在跑。用现有实例，或者结束旧进程再启动 |
| 手机打不开，电脑开着 | 计划任务状态、4318 是否监听、`tailscale status` 里有没有手机 | 任务被停（退出码 0x41306 表示被手动或外部停止），任务只在登录时自启，锁屏解锁不算登录，所以要手动 Start。另一种情况是手机不在 tailnet 里 |
| 页面一直转圈、超时 | TCP 能连上但 HTTP 不返回；看后端进程 CPU | 后端卡死，常见原因是两个实例同时开着。结束卡死的 PID，启动器 30 秒内会重新拉起 |
| 服务停了，日志没有错误 | `supervisor.log`、`server.log` | 先启动起来，如实说"原因没查到"。出现过好几次 |
| 研究任务暂停："Claude CLI 进程未成功退出" | 用同样的参数手动跑一次 CLI | 2026-11-10 的原因是 CLI 升级到 2.1.322 后拒收 `$schema`，现在所有调用都会去掉它。CLI 升级可能弄坏参数，先复现再修 |
| 研究暂停："模型引用了本轮未读取的证据" | 看暂停在哪一步、引用了哪个 E 号 | 后面的专家引用了前面专家读过、但自己这一步没检索到的资料。现在前面引用过的资料会带原文传下去，引用出错还会重试一次 |
| 回复很慢、"thinking"很久、超时 | CLI 调用参数、模型和思考强度；在库副本上计时 | 见 ai-evidence.md 的"性能"一节 |
| 自动联网搜索每次都失败 | 任务的采集状态码 | `SEARCH_DISABLED` 表示没配 Tavily；`SEARCH_BALANCE_UNKNOWN` 表示余额确认超过 24 小时。用户要自己去 `.env` 更新确认时间 |
| 设置页显示 pro，用户说已经升级 Max | `claude auth status` 的 subscriptionType | CLI 凭证是升级前拿的。让用户运行 `claude auth logout` 再 `claude auth login` |
| 选 Opus 报错 | `claude --version` | 全局 CLI 太旧（Opus 5.5 需要 2.1.280 以上）。服务器用的是 `~/.local/bin/claude`，不是 VS Code 自带的那个。`claude update` 要先问用户 |
| 改了界面，线上没变化 | dist 里 index-*.js 的名字和线上是否一致 | 构建后没重启（服务启动时会列出静态文件）。按第 2 节重启 |
| 改了 CSS 不生效 | 浏览器里看是哪条规则在生效 | 被 `main.jsx` 里后加载的 CSS 或更具体的选择器压住了，见 architecture.md |
| `npm install` 卡半小时 | 错误里有没有 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | 杀毒软件或代理在拦 HTTPS。临时加 `--registry https://registry.npmmirror.com`。不要关 TLS 校验；全局改 registry 要先问用户 |
| Claude Code 报"Prompt is too long" | 接了多少 MCP、附件有多大 | 工具定义和附件太大。用户的应对是开新会话，并说明"本轮只处理 business/frontend，按需读取"；也可以 `/mcp` 关掉无关的 MCP |
| 用户问能不能上 Vercel | — | 不能：后端常驻、PGlite 在本地、推理靠本机 CLI 登录、任务最长 30 分钟、应用在子目录里。推荐继续用 Tailscale；想不开电脑也能用就要云服务器加 API，改动大 |

## 7. 日志和状态在哪

| 什么 | 在哪 |
| --- | --- |
| 线上地址 | `business\.runtime\remote\address.txt` |
| 启动器和后端日志 | `business\.runtime\remote\supervisor.log`、`server.log`（`Get-Content … -Tail 20`） |
| 备份 | `data\data_storage\backups\database\`（手动的）和 `…\daily\`（每日任务的，保留 30 份） |
| 每日导入结果 | `data\data_storage\reports\sync\daily\latest.json`；在 app 里看「追踪 Hackathon」面板顶部 |
| 手动导入报告 | `data\data_storage\reports\sync\manual\`、`reports\imports\` |
| 清理报告 | `data\data_storage\reports\retention\latest.json` |
| 计划任务 | `Get-ScheduledTask -TaskName 'Lydia*'`；参数在 `(Get-ScheduledTask 'Lydia Drive Daily').Actions` 里 |

电脑上还有一个计划任务 `DailyNewsAutoPublish`，属于另一个项目 `C:\maven\project\daily news`，和 Lydia 无关。
