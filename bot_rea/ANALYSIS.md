# Grok Bot 0.78.1 分析结果

最新组件层实现与截图见 [页面/组件交付](COMPONENT_PORT_REPORT.md)。下文保留安装包分析及最初样式适配的记录，组件“仍未修改”的描述属于后续已推进的历史阶段；原厂运行验证限制仍有效。

## 对象与方法

对象：`C:\Users\User\AppData\Local\Programs\Grok Bot\resources\app.asar`，52,604,021 字节。根 package 声明 `productName: Grok Bot`、内部包名 `sand`、版本 `0.78.1`、主入口 `dist/electron-main/main.cjs`。归档身份和 898 个文件清单见 `evidence/artifact-inventory.json`。

使用 npm 缓存中的固定版本 `rea-agents@6.4.0` 执行静态分析，没有运行归档中的代码，也没有修改原安装文件。曾打开已有应用查看外观，但窗口仅出现加载区域，未获得登录后的实际工作流。因此登录后行为只按静态证据陈述，不能当成运行验证。

## REA 实测结果

| 项目 | 观察 |
| --- | --- |
| 相关文件 | 721 |
| 成功解析 JavaScript 文件 | 694；parse_failures=0 |
| 读取文本字节 | 50,370,994 |
| 遍历 AST 节点 | 8,107,507 |
| 应用图 | 3,309 个节点、3,622 条边 |
| Electron 静态摘要 | BrowserWindow 观察 6；context bridge 观察 9；原生 addon binding 观察 6 |
| IPC | 15 项操作，其中 13 项通道是动态表达式，不能据此恢复全部 IPC 合约 |
| 完整性矛盾 | 10 个解包后原生文件的实际哈希与归档声明不同，已记录保留，未判断原因 |
| 覆盖 | **partial**，存在语义结果预算限制和动态边界；不是完整源码恢复 |

初次严格校验的错误保存在 `evidence/rea-initial-integrity-error.json`。随后使用 `--integrity-policy record-and-continue` 留存实际文件证据，退出码为 0。工具同时产生资源约束记录，不能把“退出成功”解释为全部语义已恢复。`statistics.modules` 与应用图的 module 节点计数属于不同输出，保留原始数值，不用某一计数推断完整性。

## 可确认的程序结构

| 层 | 本机静态证据 | 可确认的范围 |
| --- | --- | --- |
| 桌面宿主 | `dist/electron-main/main.cjs` 与 Electron BrowserWindow/IPC 观察 | Electron 主进程管理窗口与桌面能力；服务端实现不在此结论内 |
| 页面桥接 | `dist/electron-preload/preload.cjs`、`preload-webview.cjs`、`preload-vnc.cjs`、desktop-mount 相关 preload | 存在页面与桌面、WebView、远程显示相关边界；没有运行验证远程电脑 |
| React 前端 | `index.eager-app-D25OYGQG.js`、`index.eager-common-DbK3Oi_r.js`、`index.eager-platform-C2su3Zzb.js` | React/StyleX 打包模块、主题、导航、会话与组件分块 |
| Bot 管理 | `chunk-team-bot-details-pane-*`、`chunk-team-bot-line-render-*`、template/editor/avatar 相关分块 | 分块名和静态引用支持存在详情、列表、模板与头像编辑界面；不证明账号当前有权限 |
| 自动化与扩展 | automation-detail、custom-plugins、custom-mcp 相关分块 | 有对应界面入口/模块；没有调用这些服务 |
| 样式与字体 | `index-Dh7EWA8t.css`、`X-VF-C7NyO54W.woff2`、`XMono-VF-K4lk0ar0.woff2` | 已提取实际设计 token 与字体，可独立参考和本地接入 |

本次没有恢复或接入 Grok 的推理服务、云电脑、计费系统和账户授权；客户端出现某个模块也不代表该功能能离线工作。官方产品信息可查看 https://x.ai/bot ，具体套餐不是本次静态分析的前提。

## 已接入 Lydia 的设计

| 设计项 | 安装包中的依据 | Lydia 接入 |
| --- | --- | --- |
| 浅色主面板 / chrome / 侧栏 | `#ffffff` / `#fcfcfc` / `#f5f5f5` | 主窗口、导航、Settings 和 Crawl 的对应表面 |
| 深色主面板 / chrome / 侧栏 | `#161616` / `#121212` / `#0e0e0e` | 深色主题对应表面；文字使用 `#f5f5f5` |
| 正文字体 | XVF 与 XVF Mono，原声明 variable weight 200–800 | 本地字体资源经过 Vite 打包，代码区使用 Mono |
| 字号 | 原 token base 14px、sm 13px、xs 12px、xl 17px | 表单与设置参考原值；主界面按用户要求保留较大且响应式的文字，手机输入保留 16px |
| 桌面面板 | `expandedWidth:280`、info pane `width:320` | 源默认值仅作研究记录；按用户要求保留 27% 导航 + 42% 聊天 + 31% 研究面板，窄屏用抽屉 |
| 交互外观 | 轻边框、中性色悬停、圆角控件、紧凑列表 | Composer、按钮、选中行、Settings、Crawl 一起接入 |

实现位于 `business/frontend/src/grok-design.css` 和 `src/assets/grok/`，当前入口已直接加载。复用了现有 Lydia React 组件与后端，品牌、人物头像和研究流程保留；**这是基于实际设计资源的前端适配，不是已经恢复全部登录后 Grok UI 的像素级复刻**。静态布局、组件与字体有证据；不可见状态和云端行为保留未知。

## 验证与使用

React production build、TypeScript 检查通过。原应用浏览器验证 21 项通过，包含用户要求的 27/42/31 面板比例、字体/色板以及原来的案件隔离、导出、深浅主题、移动端、PWA 和退出。Crawl 浏览器验证 14 项通过，包含项目导入、导出下载恢复、奖项驳回、手机布局；0 页面与控制台错误。全部使用临时 TEST_ONLY 数据，无真实模型调用或 Grok 付费调用。

完整自动化测试 54/54 通过。截图和 JSON 报告见 `validation/`。不购买 Grok plan 也能运行这套 Lydia 界面；Lydia 的实际模型能力依赖你原本配置的后端。

用户反馈修正：之前仅移植了字体、主题 token 和部分控件样式，页面组件结构仍是 Lydia 原结构。此前“前端设计接入完成”的说法过宽；完整 Grok 页面和组件移植未完成。两侧窄化属于适配错误，现已恢复既有比例及主面板可读字号。
