# 测试和验收

## 常用命令（在 business 目录下运行）

```powershell
npm.cmd run check            # tsc --noEmit，后端和测试的类型检查
npm.cmd test                 # node --test，所有 tests/*.test.ts，串行
npm.cmd run test:browser     # browser-test.ts + call-browser-test.ts
node --experimental-strip-types --test --test-concurrency=1 tests/file-import.test.ts tests/knowledge.test.ts   # 只跑相关的几个
node --experimental-strip-types scripts/<某个>-browser-test.ts
```

各功能的浏览器测试：knowledge-browser-test、knowledge-touch-test（长按拖动、双指缩放）、warehouse-browser-test、workbench-browser-test、mobile-workspace-test、call-browser-test、crawl-browser-test、phone-test 等。改了哪块就跑哪块，上线前把相关的几组都跑一遍。

2026-11-11 时单元测试共 166 项。每次汇报写"N/N 通过"，新增了几项也要写。

## 隔离原则

- **测试从不碰正式库和线上服务。** 用临时 PGlite 目录、随机端口，调用 `createApp({dataDir, startWorker:false, localAutoLogin:true})`。浏览器测试脚本本来就是这么写的。
- 推理默认用 mock CLI。确实需要真实 Claude（测速、验证生成质量、测路由）时，在临时库或库副本上跑，并向用户报告调用次数。
- 测试数据带 `TEST_ONLY` 标记，不能混进正式库，也不能当真实证据。
- **迁移要先在正式库的副本上验证**（复制库，用新代码打开，看迁移有没有报错、原数据还在不在），再上线。
- 读正式库做分析时，也是先复制到 scratchpad。

## 写测试

- **每修一个 bug 就加一条回归测试**，测试名用一句话写清楚行为，例如"a later expert receives and may cite sources an earlier expert already cited, but not unknown ones"。
- 先看现有测试怎么搭夹具（例如 `CrawlStore.init()` 要先初始化平台表），照着写。
- 夹具不要碰巧满足条件。2026-11-09 有个"引用资料传递"的测试，夹具文本里含 `TEST_ONLY`，被检索直接找到了，测试是因为错误的原因通过的。夹具的文字要和查询无关。
- 测"不该发生"的事也要写，例如：伪造的 ID 被拒、跨案件读不到、没网址的条目被拒、缺时区的日期被拒。
- 旧断言和用户刚批准的新行为冲突时（例如聊天字号至少 18px，而用户批准了 15–16px），改断言、加注释写明批准日期，并在汇报里说明。和新行为无关的失败，不要顺手改断言，要查清楚，再告诉用户。
- 有测试写死了迁移数量，加迁移时一起改，并按名字检查新迁移。

## 浏览器测试的写法

- 用 `playwright-core` 加本机 Chrome：`executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'`。路径用正斜杠，反斜杠在 heredoc 里会被吃掉。
- 视口：电脑 1440×900（或 1440×820，用来检查拥挤），手机 390×844（`isMobile`、`hasTouch`），平板也要测。白天和黑夜都要测（`localStorage['lydia-theme']`）。
- 收集 `pageerror` 和 console error，要求为 0。
- **等动画结束再测量**，否则会测到打开动画的中途。写一个 wait helper，等缩放到 100% 或面板展开完再量。
- 判断遮挡用 `document.elementFromPoint` 逐字或逐点检查；斜着的文字用 bbox 判断重叠会误报。
- 提示条（toast）会挡住点击，测试开始前先关掉它（`sessionStorage['lydia-tracker-toast']='dismissed'`）。
- 浏览器会记住状态（localStorage、托盘里的东西），每个用例要从干净状态开始，或者用新的 context。
- 截图后用 Read 工具亲眼看，不能只看断言结果。

## 验收用语

主提示词规定的状态词，汇报和文档里都按它写：

| 词 | 意思 |
| --- | --- |
| GENERATED | 文件已生成 |
| LOADED | 实际读进来了 |
| CONNECTED | 真实连接成功 |
| TEST_PASSED | 指定的测试通过 |
| NOT_RUN | 没运行 |
| BLOCKED | 被具体依赖卡住（写清楚缺什么） |

中文汇报里用：通过 / 失败 / 未运行 / 受阻。

- **模拟通过和真实通过分开写。** 例如语音通话的四项验收：界面"自动化测试通过，还需要你看一眼"；电脑语音闭环"未运行"。
- 桌面模拟手机尺寸不等于真手机验证通过；"在电脑的 Chrome 里模拟触屏跑的，还没在真的 iPad 或手机上试过"。
- 性能数字要说明条件："在电脑的无头 Chrome 里测，拖动时每帧约 6ms，但还没在真机 iPad 上验证过"。
- 失败的原始结果要保留，不能用之后的通过结果覆盖（`verification/test-history.json` 就是这个用途）。

## 报告和证据放哪

- `business/test-results/`：测试输出（被 git 忽略）。
- `pic/<主题>/render-report.json`、`implemented/report.json`：设计和上线截图的检查结果。
- `business/docs/acceptance/`、`data/docs/acceptance/`：正式验收记录（例如真实导入）。
- `business/docs/IMPLEMENTATION_STATUS.md`：大功能完成后补一段：做了什么、验证了什么、还没验证什么。
