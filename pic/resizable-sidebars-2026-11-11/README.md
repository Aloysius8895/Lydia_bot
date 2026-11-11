# 左右侧栏可以拖动调整宽度

2026-11-11。状态：**已实现并上线**（同一天确认）。代码和设计稿相同：`business/frontend/src/panel-resize.jsx`、`panel-resize.css`。

以下是当时的设计稿说明。

需求：Lydia 主页面和知识库页面，左右两边的侧栏都可以自己拖动调整宽度。

## 先看视频

- `demo-main.webm`：主页面，先拖左边，再拖右边，最后双击右边的分隔线恢复默认。
- `demo-knowledge.webm`：知识库页面，同样的操作。

用 Chrome 打开。

## 想自己拖一下试试

在 `business` 目录运行：

```powershell
node --experimental-strip-types ../pic/resizable-sidebars-2026-11-11/render.mjs --serve
```

然后在电脑浏览器打开终端里显示的地址（端口 5310）。用的是 11-10 数据库备份的副本，不会写入正式资料库。按 Ctrl+C 结束。

## 截图

| 图 | 内容 |
| --- | --- |
| 01-main-default.png | 主页面，默认宽度（左 367px，右 422px，窗口 1440 宽） |
| 02-main-hover-divider.png | 鼠标移到左侧栏和对话之间的缝隙：出现一条细线，鼠标变成左右箭头 |
| 03-main-dragging.png | 拖动中：左侧栏收窄到 277px，右侧栏拉宽到 532px，中间的对话区跟着变 |
| 04-main-dark-resized.png | 黑夜模式，刷新后宽度还在 |
| 05-knowledge-default.png | 知识库，默认宽度（左 225px，右 306px） |
| 06-knowledge-hover-divider.png | 鼠标移到书库和右侧栏之间 |
| 07-knowledge-dragging.png | 拖动中：左侧栏 295px，右侧栏 436px，书库跟着缩放 |
| 08-knowledge-dark-resized.png | 黑夜模式，刷新后宽度还在 |

## 怎么用

- 把鼠标移到侧栏和中间区域之间的缝隙，会出现一条细线，鼠标变成左右箭头。按住左右拖动就行。
- 双击这条线，恢复默认宽度。
- 用 Tab 选中分隔线后，可以按 ← → 键调整，每次 16px，按住 Shift 每次 64px。
- 拖动时按 Esc，取消这次拖动。
- 宽度记在这台设备的浏览器里，刷新页面后还在。主页面和知识库分开记。
- 没有动画和特效，只有那条细线淡入。

## 限制

| | 最窄 | 最宽 |
| --- | --- | --- |
| 主页面左侧栏 | 220px | 440px |
| 主页面右侧栏 | 300px | 640px |
| 知识库左侧栏 | 180px | 400px |
| 知识库右侧栏 | 240px | 600px |

- 中间区域至少保留 380px（主页面）或 360px（知识库）。侧栏拖到这个限度就停住，不会把中间挤没。
- 手机上没有分隔线，布局不变。
- 知识库左侧栏收起成图标栏时，左边的分隔线隐藏。展开后，回到你上次拖的宽度。
- 窗口宽度在 761–850px 之间时，知识库左侧栏本来就是图标栏，只能调右边。

## 渲染时发现并改掉的问题

第一版渲染时，知识库左边的分隔线盖住了侧栏右上角的「‹ 收起」按钮，这个按钮点不到。现在分隔线放在按钮下层，按钮可以正常点击（`render-report.json` 里有这一项检查）。

## 自动检查（render-report.json）

13 项都通过：两个页面都显示分隔线；拖动后宽度改变；刷新后还在；右侧栏不会超过 640px；对话区至少保留 380px；双击恢复默认；方向键每次 16px；收起按钮能点；收起后再展开回到原宽度；手机没有分隔线。

## 如果确认，要改的正式文件

- `frontend/src/panel-resize.jsx`（新增）：分隔线组件，以及记住宽度的逻辑
- `frontend/src/panel-resize.css`（新增）
- `frontend/src/main.jsx`：引入上面的 CSS
- `frontend/src/App.jsx`：主页面加两条分隔线
- `frontend/src/components/KnowledgeWorkspace.jsx`：知识库加两条分隔线

和现在正式版本的差别见 `proposed/*.patch`。确认后会重建 `frontend/dist`，并重启 Lydia Remote。
