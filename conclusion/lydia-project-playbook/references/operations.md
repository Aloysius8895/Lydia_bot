# 启动、访问、排障与 Obsidian

## 根据当前运行方式选择入口

用户经常需要可复制指令。先说明在哪个 shell／目录运行，不混用 CMD 与 PowerShell，不写 npm.start。以下不代表需要同时运行：

```powershell
Set-Location C:/maven/business_agent/business
npm.cmd start
```

对应本机 `Start-Lydia.cmd`，兼容 Start-Crew；默认 HTTP 127.0.0.1:4318。`Start-Crawler.cmd` 仍启动同一后端。局域网手机使用 Start-Lydia-Phone.cmd，跨网使用 Start-Lydia-Remote.cmd／现有 `Lydia Remote` 计划任务。

已有远程任务时查看／启动该任务，不再 npm start 抢占同一库：

```powershell
Get-ScheduledTask -TaskName 'Lydia Remote','Lydia Drive Daily' -ErrorAction SilentlyContinue
Get-NetTCPConnection -State Listen -LocalPort 4315,4316,4317,4318,4319 -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'Lydia Remote'
```

Start 是操作命令，只在用户要启动／恢复时执行。盘点或整理文档仅做只读检查。不要为了确认数据量打开正式 PGlite。

## 手机 LAN 与 Tailscale

LAN：手机与电脑同网，电脑私有 IP HTTPS 4318；4319 仅公开 CA／安装引导，不公开私钥。证书链／主机名需验证，iPhone Safari 真实信任与主屏幕安装不能用桌面 viewport 代替。

跨网络：本人电脑与手机安装 Tailscale、同账号在线、MagicDNS + HTTPS Certificates，固定电脑 `.ts.net:4318` 地址。不是 Vercel 静态／无状态部署：系统依赖本机 CLI、持久单进程库、worker 与 Ollama。电脑需开机、未睡眠且后端在线，手机主屏幕图标不会替你启动电脑。

远程 launcher 管理证书、地址、构建和唯一服务，Windows 计划任务保持后台；Tailscale 未连接会重试。旧 LAN PWA 图标不自动改成 MagicDNS，可能需重新添加。锁屏与休眠分开；断开电脑后任何手机均不能用。

## 用户免密码决定

本机 loopback 默认免密码，2026-11-11 远程 launcher 亦设置 LYDIA_TAILNET_AUTO_LOGIN=true。远程自动会话须同时满足 HTTPS、对端与本机均为 Tailscale 地址段、目标为 `.ts.net`；12 小时会话到期前端换新重试一次。

保留 cookie／CSRF／Origin／Host 校验，裸 `/api/cases` 无会话应 401。用户「取消登录页」不是移除所有 API 鉴权；不要关闭这些检查或开放公网。局域网等非适用地址按现有密码规则。不得启用 Funnel 或给其他用户共享后仍称仅本人可访问。

## 常见故障的定位顺序

| 症状 | 先查 | 避免的误判 |
| --- | --- | --- |
| 页面没变 | 实际地址／进程、manifest、dist、资源 hash、SW | 源码修改等于线上已更新 |
| 端口占用／数据库锁 | Remote launcher、维护任务、监听 PID、实际库路径 | 随便改端口启动第二份 Store |
| 手机打不开 | Tailscale 在线、URL、TLS、电脑睡眠、监听与现有防火墙 | 手机图标就是云端部署 |
| 回答无输出 | CLI auth、退出分类、所有 profile schema、StructuredOutput、queue | 直接认定网络慢／模型差 |
| 完整流程零缺口 | brief／E 证据数量与种类、搜索预算状态、专家原输出 | 反复换大模型强迫凑数 |
| 新闻未更新 | 上游 news.json、ready、无效字段、冲突、daily 报告、搜索 | 误把其他早报项目当 Lydia 数据源 |
| 导入后书库少项目 | 简介 worker 状态／可见性规则、查询过滤、来源类型 | 数据一定丢失 |
| Settings 按钮点不到 | 固定账户栏、滚动底部、overlay／resize z-index | 盲目新增另一个设置入口 |

查看配置只读取必要的非敏感字段，不整份打印 .env、凭据、浏览器 profile 或用户 token。依赖安装遇网络／校园网问题优先核对错误与缓存，不关闭 TLS 验证或修改全局认证。

## Obsidian

`backend/obsidian.ts` 实现数据库 → Markdown 单向桥。按本机 Obsidian registry 查 vault，目标须 realpath 确认为实际 Vault 内的 Lydia 子目录。已有配置启用时约每分钟同步，状态与 manifest 记录结果；不是数据库换成 Obsidian。

项目、新闻、研究、收藏 idea 生成稳定 ID 文件，managed 内容与 `LYDIA-NOTES` 下方用户笔记分界。保留用户笔记、冲突不覆盖；数据库删除也不擅自删手写笔记。summary_only 在导出中明确标识，索引不再列出的笔记不等于已从磁盘删除。不声称任意 Markdown 编辑会自动回写数据库。

运维原文：`business/docs/{RUNNING,REMOTE_ACCESS,IPHONE_INSTALL}.md`、`business/scripts/{start-remote,start-phone}.ts`、`business/backend/{auth,phone,obsidian}.ts`。历史账号、IP 和证书状态都需重新确认。
