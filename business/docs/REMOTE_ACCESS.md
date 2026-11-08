# 手机跨网络访问 Lydia

适用于本人电脑和手机。电脑与手机安装 Tailscale、登录同一个账号后，手机可使用流量或其他 Wi-Fi。应用保留原有项目和工作区密码。地址改为电脑的固定 MagicDNS HTTPS 名称，旧局域网图标不会自动改地址。

## 首次设置

1. 在电脑从 [Tailscale 官网](https://tailscale.com/download/windows)安装并登录。手机安装 Tailscale，登录相同账号并连接。
2. 在 [Tailscale DNS 后台](https://login.tailscale.com/admin/dns)启用 MagicDNS 和 HTTPS Certificates。签发 HTTPS 证书会将设备 DNS 名称写入公开证书日志；应用本身仍只在私人 Tailscale 网络内可达。[官方证书说明](https://tailscale.com/docs/how-to/set-up-https-certificates)
3. 使用现有 Lydia 密码；如果从未设置过，先在原来的电脑本机版本设置至少 12 字符的密码。本次部署检查时此工作区已有密码，不会重置。
4. 在原 Lydia 终端按 Ctrl+C 正常停止服务。不要同时运行本机版、手机局域网版和远程版。
5. 以本人当前 Windows 账号打开「管理员 PowerShell」，运行：

```powershell
cd C:\maven\business_agent\business
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-remote.ps1
```

脚本构建前端、检查证书、创建仅限 Tailscale 本机地址 TCP 4318 与 Tailscale IPv4 对端的防火墙规则，注册当前用户的 `Lydia Remote` 登录任务，并立即启动。任务以有限权限运行，沿用本人 Claude 登录和 Ollama；不创建公网入口、不修改整个系统的执行策略、不重置密码。安装 Tailscale、启用 HTTPS、账户登录和系统管理员授权由本人完成。

6. 将命令输出的 `https://电脑名称.tail名称.ts.net:4318` 地址在手机 Safari/Chrome 打开，输入原有 Lydia 密码。使用该新地址重新添加到主屏幕。不要继续打开旧 IP 地址的 App 图标。

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

## 验证与恢复

- 手机断开 Wi-Fi、使用流量并连接 Tailscale，打开新 HTTPS 地址且没有证书警告，验证密码登录和原有项目。
- 锁定电脑后重复打开；下次登录 Windows 后检查任务和地址。
- 未登录时 `/api/cases` 必须拒绝访问；远程密码自动登录必须关闭。Host、Origin、CSRF 检查保持原样。
- 若提示端口占用，停止原运行窗口，启动器会自行重试；不要再启动另一个实例。
- 若改了设备名称或 Tailscale 地址，停止任务并重新执行 setup，随后更新手机图标。
- 若想回到原电脑版本，先停止远程任务，确认 4318 监听结束，再运行 `Start-Lydia.cmd`。

在安装 Tailscale、本人登录、启用 HTTPS、执行管理员 setup 和手机流量测试之前，只能视为部署脚本已准备，不能视为远程部署已完成。
