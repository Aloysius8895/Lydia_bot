# 远程控制通道

这是代码和配置说明，不是已经上线的部署。没有创建 Vercel 项目、数据库或域名。

## 现在可以怎样用

不设置 `LYDIA_RELAY_URL` 时，行为和原来一样：`business` 目录里 `npm start`，页面和 API 都由本机 `backend/server.ts` 提供，默认只监听 `127.0.0.1:4318`。本机回环上的自动登录只对这个本机来源生效。

远程网页只负责登录、看执行器是否在线、提交固定的 `question` 或 `research` 任务，以及看到步骤、真实错误和一段短结果。模型、Ollama 和 PGlite 仍在这台电脑上。网页不会直接访问 localhost。

## 为什么必须有共享持久库

Vercel 函数是多实例、无共享内存的。把任务放进某个实例的内存里，下一次请求会找不到，也会让两台电脑领到同一任务。因此远程提交在缺少下面两项配置时返回 `COORDINATION_UNCONFIGURED`，不会假装成功：

- `LYDIA_COORDINATION_DATABASE_URL`：你自己的 Postgres 连接串。不能是 localhost，驱动也不能是 `memory`、`file` 或 `pglite`。
- `LYDIA_RELAY_BOOTSTRAP_TOKEN`：只放在服务端和本机注册脚本环境里，用来第一次设置密码。

`pg` 适配器在 `business/relay/postgres.ts`。本仓库的测试用临时 PGlite 执行同一套 SQL，证明协议；那个测试库不会在 Vercel 上充当共享队列。

Hobby 是否允许这个站点，仍要你自己对照 Vercel 的个人/商业使用条款确认。本说明不把 Hobby 当成已经获准的免费额度。

## 本机执行器

1. 在 Vercel 环境配置上面两个变量，并部署你已审阅的版本。部署动作不在本次自动执行。
2. 在电脑上设置 `LYDIA_RELAY_URL` 为该站点的 https 地址，同时设置引导凭据和 `LYDIA_OWNER_PASSWORD`，运行 `node --experimental-strip-types scripts/register-device.ts`。
3. 脚本把设备凭据写入 `business/.runtime/device-token`，权限仅限当前用户。终端和前端包都不打印这串凭据。再次注册会作废上一台设备，避免两台电脑同时写研究库。
4. 启动原来的 `npm start`。只有协调地址是公网 https 且凭据文件存在时，才会每 3 秒发出一次短请求。监听地址不变。

执行器不在线时，新任务返回 `EXECUTOR_OFFLINE`，协调库里不会新增这行。已经接受的任务留在库里；租约过期且模型已经开始后，状态变为暂停，需要你在页面上恢复，不会自动再跑一遍。

## 明确留在本机的事

公网抓取、Tavily、X 和 ElevenLabs 仍沿用原来的开关和确认，默认关闭。推理仍要求本机 Claude 订阅登录，不增加 API key 自动计费。商业模式阶段仍在本机界面里选择 Gap 后进行，远程通道不接受 `model` 任务。
