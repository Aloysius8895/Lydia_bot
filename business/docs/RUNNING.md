# Lydia — 个人商业研究 PWA

一个固定顾问入口，按需加载五位专家方法。应用在本人电脑运行，手机可通过受信任 HTTPS 使用并添加到主屏幕。Claude 推理通过本人已登录的 CLI 订阅联网执行；embedding 和数据库本地运行。

## 启动

```powershell
cd C:\maven\business_agent\business
npm.cmd start
```

启动会先构建用户原有 `frontend/src` Crew 设计到 `frontend/dist`，再启动统一 RAG 后端。根目录 Start-Lydia.cmd 执行同一流程。已有依赖无需重新安装；直接运行 backend/server.ts 前需先执行 `npm.cmd run build:frontend`。

桌面点击侧栏 **Settings** → 外观，切换白天/黑夜；白天按钮显示太阳，黑夜显示月亮，会记住设备选择。手机首页右上角齿轮进入设置，聊天页可通过右上角详情 → 设置进入。

电脑打开 `http://127.0.0.1:4318`。首次在电脑本机设置至少 12 字符的个人密码，没有预设密码。不要把测试脚本中的 TEST_ONLY 密码用于真实账号。

如需配置，复制 `deployment/.env.example` 为 `deployment/.env`，然后：

```powershell
node --env-file=deployment/.env --experimental-strip-types backend/server.ts
```

默认不需要 Anthropic API key 或 Telegram token。官方 CLI 登录由本人在终端完成：`claude auth login`；应用不处理 OAuth token。已登录但状态不能确认时暂停，不自动转 API 计费。应用设置页可记录已在官方账号设置关闭额外用量的确认。用户在本次会话已确认这一点，审计脚本在本地数据库保存了该确认，仍不能证明未来账号设置始终不变。

停止：运行服务的终端按 Ctrl+C。服务关闭会终止本应用的模型任务，保留 checkpoint；再次启动后任务暂停，可由用户恢复。不会自动终止其他 Claude 会话。

## 本地依赖

- Node 24+。
- 官方 Claude Code CLI（本轮实际版本 2.1.143），本人有效订阅与网络。
- Ollama 和 `nomic-embed-text:latest`（本轮已有模型，不下载新模型）。当前小样本跨语言召回未达目标，见评估报告；更换 embedding 后需重新索引。
- 应用依赖已锁定在 package-lock.json：PGlite 0.3.16（内含 vector 扩展）、Zod；开发验证使用 TypeScript 和 Playwright Core。没有启动独立 PostgreSQL 或 Docker。

数据库是 PGlite 嵌入式 PostgreSQL WASM + pgvector，默认在 `.runtime/data` 持久化，单应用进程使用。不要同时启动两个实例读写相同目录。相对于 business，Schema 在 `../data/database/schema.sql`，存储接口在 `../data/database/store.ts`，采集/检索实现位于 `../data/RAG/`；数据模块的绝对路径为 `C:\maven\business_agent\data`。首次安装新环境时也需在该 data 目录执行 `npm.cmd ci`。使用标准参数化 PostgreSQL 查询，当前未实现远程数据库连接。备份前先停止应用，复制配置指定的完整数据库目录（默认 `.runtime/data`）；不要将其提交源码仓库。

## 恢复专家资料

已确认六份原有技能位于 `C:\maven\business_agent\business\skills`，应用与文档已迁入同一 business 根目录。运行时按相邻目录读取，不复制或修改原技能。预期六目录为：

```text
steve-blank-discovery/
teresa-torres-opportunity/
april-dunford-positioning/
bob-moesta-demand/
ash-maurya-lean-model/
hackathon-gap-research/
```

人物需要 `SKILL.md` 与 `references/methods.md`，主控需要 `SKILL.md` 与 `references/protocol.md`。刷新设置页会真实读取并记录 hash。运行方式为应用显式注入方法上下文，不声称 CLI 原生技能自动注册；CLI 自身工具和技能发现关闭，避免绕过应用的数据库/费用/案件权限。

资料可先上传和检索；研究任务缺少方法时会暂停。恢复技能后，点击任务“恢复此任务”继续。不要将测试夹具当成正式方法资料。

## 研究流程

1. 创建项目，提供 idea/brief 和地区。
2. 添加真实资料或公开 URL；当前上传支持 TXT/MD/JSON/CSV 文本，PDF/扫描件需先提取文本。网页抽取仅支持可公开读取的 HTML/文本/JSON，失败状态保留。
3. 发送顾问问题或运行完整研究；固定角色按任务路由，完成步骤持久化。
4. 查看证据、候选缺口和企业要求。所有来源支持仍需要核对原文，公开评论不等于真实访谈。
5. 明确选择一个 Gap，才允许商业模式任务；“继续”不会选择。
6. 设置页导出版本快照。Markdown/JSON 文件保存在 `business/cases/<case-id>/<timestamp-version>/`，浏览器同时下载报告 JSON 包。

默认不配置自动搜索。可以提供 URL/上传资料继续研究。只有明确配置免费账号、最近确认的可用 credits 与禁止超额扣费时，搜索接口才会运行；没有凭据/余额不明/用尽时停止，且不使用收费后备。搜索摘要不是市场证据，需另外读取正文。本版无全网持续监测或 n8n；这些不属于当前主提示词的第一版。

## 手机与 HTTPS

默认仅监听电脑 loopback，手机无法通过该地址访问。设置页的 PWA/手机操作说明不等于已完成真手机安装。

个人局域网部署步骤：

1. 选择电脑的稳定局域网地址；确认手机可达。不得将 `127.0.0.1` 当作手机访问电脑的地址。
2. 用本人信任的证书工具创建**包含该地址 SAN** 的 HTTPS 证书；将私钥/证书放 `deployment/certs`（已忽略）。不要使用来源不明的根证书，不向手机传私钥。
3. 在 `deployment/.env` 设置 `HOST=0.0.0.0`、`PORT=4318`、`APP_ORIGIN=https://<电脑局域网地址>:4318`、`HTTPS_KEY_FILE=deployment/certs/crew-key.pem`、`HTTPS_CERT_FILE=deployment/certs/crew-cert.pem`。
4. 本人按手机系统操作安装并信任对应根证书，访问 HTTPS 无证书警告后再登录。需要放行防火墙时，只针对本人可信局域网；本任务未自动改变防火墙或证书信任。
5. iPhone 在 Safari 的分享菜单选择添加到主屏幕；Android 在浏览器菜单选择安装应用/添加到主屏幕。实际菜单以版本为准。
6. 从新图标启动，检查独立窗口、登录、项目恢复、上传、长任务重连与取消。关闭电脑后应显示不可连接，不能继续研究。

普通 HTTP 局域网预览、自签名但未被手机信任的页面、桌面模拟尺寸都不能证明 PWA 安装已通过。真手机安装目前 NOT_RUN。没有配置公网、隧道、域名或云服务器。

## 验证

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:browser
node --experimental-strip-types scripts/retrieval-evaluation.ts
```

测试夹具均 TEST_ONLY。实际报告在 `test-results`，CLI 最小真实调用证据在 `verification/cli-connectivity.json`。最新原设计集成验证为33项功能/边界测试、16项浏览器流程；本轮浏览器 CLI 身份为模拟、实际推理禁用，数据库与导出均在临时目录。此前旧路径导致的技能加载阻塞已解除；实际专家行为/单顾问对照需分别运行，不能把文件读取或离线功能测试当作完成该验收。迁移前的测试输出保留当时的绝对路径，见 project-relocation.json 的完整性记录。

首次依赖下载曾遇到权限和系统证书问题，最终通过已有 npm 缓存离线安装成功；没有关闭 TLS 校验或全局修改 npm 配置。将来重新安装请使用 `npm.cmd ci`；若同样出现证书不信任，应修复网络/证书链或换可信网络，不使用 `strict-ssl=false`。

## 范围与已知限制

- 并非已完成真实市场验证，未联系任何人或自动发送消息。
- 不支持复杂动态/登录网页、PDF OCR、Web Push、原生安装包与外网远程部署。
- 引用 ID、版本、案件归属会检查；“来源支持”主张另经隔离上下文的同模型语义复核，明显不支持时暂停、不确定时标为需人工复核。它不等于独立验证或事实真伪保证；真实专家场景的复核效果尚未验收。
- embedding 模型变化后重建索引；旧向量不会与新空间混用。多语言效果以实际报告为准。
- 电脑关闭、CLI 登出、订阅限额、网络/来源不可用时保留状态并暂停，不自动购买服务。

## 多语言查询扩展与手机 HTTPS 准备

应用可用已授权 Claude CLI 将检索查询翻译成 zh/en/ms，按案件缓存 8 小时；翻译不计作市场证据。身份、额度、结构化翻译不可用时明确退回原查询。检索与专家共用串行 CLI 队列，不自动并发消耗订阅。查询文本因此会送到 Claude 云端；原始资料与引用位置不因翻译改写。

回归/新保留集对照运行 `node --experimental-strip-types scripts/expansion-evaluation.ts`，它只发出一批合成查询翻译请求，结果与原始评估分别保存。

已安装 OpenSSL 时，可以生成本地 HTTPS 证书（不安装信任、不修改防火墙或自动切换服务）：

```powershell
node --experimental-strip-types scripts/prepare-https.ts --host <电脑私有IPv4>
```

输出 `deployment/certs/crew-local-ca.cer` 为可传到本人手机的**公开**根证书，`*-key.pem` 为私钥，绝不传到手机或分享。核对输出指纹后，按系统步骤安装并信任证书；iPhone 通常还需要在“关于本机 → 证书信任设置”中开启本人 CA 的完全信任，Android 的证书安装入口因系统版本而异。只有生成文件不等于手机信任成功。

官方操作参考：[Apple 手动证书信任说明](https://support.apple.com/en-us/102390)、[Google 证书管理说明](https://support.google.com/pixelphone/answer/2844832?hl=en)。Android 应使用设备提供的 CA 信任用途，不能把 Wi-Fi 身份证书安装成功等同于浏览器 HTTPS 信任；最终以浏览器无证书警告为准。

停止原 loopback 服务后，用 `node --env-file=deployment/.env.lan.example --experimental-strip-types backend/server.ts` 启动 HTTPS。本脚本只准备配置，未执行信任或网络变更。电脑 IP 改变时需重新生成对应叶证书。校园网可能限制设备互访；若手机不可达，先用本人可信热点/私网对照检查，再决定是否需要用户手动配置防火墙，不默认开放公网。

相关性重排使用同一 Claude CLI，只选择当前案件候选 chunk ID、允许无相关结果并拒绝伪造 ID。原文不改写；排序不是事实验证。翻译/重排均有按案件与版本的缓存，调用失败时在结果中明确标记未运行，而非声称完成重排。新旧评估保存在不同报告文件，最终小型保留集只有 3 条查询，不能当作生产效果保证。
