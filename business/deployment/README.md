# 部署配置与 HTTPS

默认个人电脑本机运行，不需要云服务器。根目录 Start-Crew.cmd 会读取本目录 `.env`（如果存在）；可从 `.env.example` 复制。不要将含密钥的实际环境文件提交或分享。

手动启动配置：在 business 根运行 `node --env-file=deployment/.env --experimental-strip-types backend/server.ts`。

`certs` 保留已生成的本机 HTTPS 证书。只有公开 `crew-local-ca.cer` 可用于本人手机信任，私钥不能分享。相对证书路径为 `deployment/certs/...`，从 business 根解析。`.env.lan.example` 仅为准备配置，并未自动开启局域网监听或完成手机安装。

完整步骤见 `../docs/RUNNING.md`。不自动安装根证书、不修改防火墙或发布公网。
