# 手机跨网络访问 Lydia

适用于本人电脑和手机。电脑与手机安装 Tailscale、登录同一个账号后，手机可使用流量或其他 Wi-Fi。2026-11-11 起（用户决定：只有本人使用）从本人 Tailscale 设备打开直接进入，不再输入密码，见下方「免密码」。地址改为电脑的固定 MagicDNS HTTPS 名称，旧局域网图标不会自动改地址。

## 首次设置

1. 在电脑从 [Tailscale 官网](https://tailscale.com/download/windows)安装并登录。手机安装 Tailscale，登录相同账号并连接。
2. 在 [Tailscale DNS 后台](https://login.tailscale.com/admin/dns)启用 MagicDNS 和 HTTPS Certificates。签发 HTTPS 证书会将设备 DNS 名称写入公开证书日志；应用本身仍只在私人 Tailscale 网络内可达。[官方证书说明](https://tailscale.com/docs/how-to/set-up-https-certificates)
3. 无需设置密码：远程启动器默认免密码（见「免密码」）。原有密码仍保存，只在关闭免密码后使用。
4. 在原 Lydia 终端按 Ctrl+C 正常停止服务。不要同时运行本机版、手机局域网版和远程版。
5. 以本人当前 Windows 账号打开「管理员 PowerShell」，运行：

```powershell
cd C:\maven\business_agent\business
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-remote.ps1
```

脚本构建前端、检查证书、创建仅限 Tailscale 本机地址 TCP 4318 与 Tailscale IPv4 对端的防火墙规则，注册当前用户的 `Lydia Remote` 登录任务，并立即启动。任务以有限权限运行，沿用本人 Claude 登录和 Ollama；不创建公网入口、不修改整个系统的执行策略、不重置密码。安装 Tailscale、启用 HTTPS、账户登录和系统管理员授权由本人完成。

6. 将命令输出的 `https://电脑名称.tail名称.ts.net:4318` 地址在手机 Safari/Chrome 打开，直接进入工作区。使用该新地址重新添加到主屏幕。不要继续打开旧 IP 地址的 App 图标。

以后登录 Windows 后会自动启动。保持电脑联网且不睡眠；锁屏可以，退出 Windows 账号或关机后不能使用。Ollama 已有登录启动项。未配置 Windows 登录前运行，因为 Claude 订阅身份与工作区属于本人用户。

## 查看与控制

普通 PowerShell 可查看状态和日志：

```powershell
Get-ScheduledTask -TaskName 'Lydia Remote'
Get-Content C:\maven\business_agent\business\.runtime\remote\address.txt
Get-Content C:\maven\business_agent\business\.runtime\remote\supervisor.log -Tail 20
Get-Content C:\maven\business_agent\business\.runtime\remote\server.log -Tail 20
```

管理员 PowerShell 停止、启动或完全取消自启动：

```powershell
Stop-ScheduledTask -TaskName 'Lydia Remote'
Start-ScheduledTask -TaskName 'Lydia Remote'
# 取消任务与本应用的防火墙规则，保留项目资料及 Tailscale：
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\maven\business_agent\business\scripts\setup-remote.ps1 -Remove
```

手动前台运行用 `Start-Lydia-Remote.cmd`；已有启动器时会拒绝重复运行。启动器每 30 秒重试未连接网络、端口占用或后端崩溃，不会结束其他服务。每 24 小时调用 Tailscale 更新证书，更新有效后热加载，不终止研究任务。Tailscale 的节点登录可能到期，需要本人重新认证；可按[官方说明](https://tailscale.com/docs/how-to/run-unattended)在 Machines 后台为本人信任的电脑管理节点密钥有效期。

## 免密码（2026-11-11）

远程启动器 `scripts/start-remote.ts` 设置 `LYDIA_TAILNET_AUTO_LOGIN=true`。同时满足以下条件时，`/api/auth/status` 自动建立 12 小时会话，不显示登录页：HTTPS、对端与本机地址都在 Tailscale 的 100.64.0.0/10、访问的是 `.ts.net` MagicDNS 名称。防火墙本来就只放行 Tailscale 对端，所以能打开的只有登录本人 Tailscale 账号的设备。会话到期后前端自动换新会话并重试一次请求。

- 局域网或其他地址仍要求密码。会话 cookie、CSRF、Origin、Host 检查不变。
- 不要把这台电脑分享给其他 Tailscale 用户，也不要对 4318 开启 Tailscale Funnel，否则对方无需密码即可进入。
- 恢复密码登录：把 `start-remote.ts` 里的 `LYDIA_TAILNET_AUTO_LOGIN` 改为 `'false'`，然后停止并启动 `Lydia Remote` 任务。

## 验证与恢复

- 手机断开 Wi-Fi、使用流量并连接 Tailscale，打开新 HTTPS 地址且没有证书警告，确认直接进入工作区并看到原有项目。
- 锁定电脑后重复打开；下次登录 Windows 后检查任务和地址。
- 没有会话 cookie 时 `/api/cases` 必须拒绝访问（401）；免密码只是自动发会话，Host、Origin、CSRF 检查保持原样。
- 若提示端口占用，停止原运行窗口，启动器会自行重试；不要再启动另一个实例。
- 若改了设备名称或 Tailscale 地址，停止任务并重新执行 setup，随后更新手机图标。
- 若想回到原电脑版本，先停止远程任务，确认 4318 监听结束，再运行 `Start-Lydia.cmd`。

在安装 Tailscale、本人登录、启用 HTTPS、执行管理员 setup 和手机流量测试之前，只能视为部署脚本已准备，不能视为远程部署已完成。
