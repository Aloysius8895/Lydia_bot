# 「相似与搭档」按钮：挪到名字旁边，换成侦探 logo

2026-11-11，**第二版**。状态：**已实现并上线（2026-11-11）**。

你选了 A（只有 logo 的圆按钮），logo 就用这一版（"不错不错"），工作台左边分区列表里的图标也换成了这个 logo。和设计稿完全一致，没有额外改动。

- 实际截图：`implemented/`，正式代码在库副本上跑，没有替换任何文件，7 项检查通过，报告在 `implemented/verify-report.json`。
- 上线：只改前端（新增 `DetectiveIcon.jsx`，改了 `KnowledgeMaterialDetails.jsx`、`WorkbenchModal.jsx` 和 `match.css`）。停 Lydia Remote，重建 `frontend/dist`，再启动。线上返回 HTTP 200，页面用的是 `index-LSMv6_OH.js`，和 `dist` 一致。没有改数据库，没有调用 Claude。

以下是设计稿说明，保留作对照。

## 需求

1. 第一版的需求：你发了截图，问"这个可以放在这个名字的旁边吗"。所以把入口从简介下面挪到项目名字右边。
2. 第二版的需求：你发了一个侦探 logo（礼帽压着一只眼睛），问"那个 button 可以换成一个侦探的 logo 吗，类似我现在截图给你的"。

你发的图是 logo 网站上的现成模板，所以我没有照抄，而是按同样的意思自己画了一个：一顶礼帽压着一只眼睛，帽檐盖住眼睛的上半部分。图标是单色的，跟着文字颜色走，白天是黑色，黑夜是浅色。

"按钮换成 logo"可以有两种理解，所以两种都做了：

- **A：按钮只有侦探 logo**（我推荐）：一个 40px 的圆形按钮，里面是侦探 logo。鼠标停上去会显示"看库里谁和它撞车、谁能和它合体，哪条新闻给了它时机"。
- **B：侦探 logo 加"相似与搭档"四个字**：右栏窄于 240px 时自动只剩 logo。

## 先看这几张

| 图 | 内容 |
| --- | --- |
| `00-logo.png` | logo 本身：160、40、24、16 像素，白天和黑夜。缩到 16px 也看得出是帽子加眼睛 |
| `02-a-logo-dark.png` | A：黑夜，和你截图同一个项目 |
| `08-b-logo-words-dark.png` | B：黑夜 |

## 截图

| 图 | 内容 |
| --- | --- |
| `01-a-logo-light.png` | A：白天 |
| `02-a-logo-dark.png` | A：黑夜 |
| `03-a-long-title.png` | A：长名字，名字换行，logo 留在第一行右边 |
| `04-a-narrow-panel.png` | A：右栏最窄的时候，名字保持一行 |
| `05-a-phone.png` | A：手机 |
| `06-click-opens.png` | 点 logo：和原来一样，打开工作台的「相似与搭档」 |
| `07-b-logo-words-light.png` | B：白天 |
| `08-b-logo-words-dark.png` | B：黑夜 |
| `09-b-narrow-panel.png` | B：右栏窄时只剩 logo |

## A 和 B 的取舍

- **A** 只占 40px，名字有足够空间：默认宽度下留给名字 218px，右栏最窄时 177px。缺点是第一次看到时，要停一下鼠标才知道它是做什么的。
- **B** 一看就懂，但按钮宽 112px，默认宽度下只给名字留 147px。explorador.pt 刚好放得下，名字再长一点就会换行。

我推荐 A。logo 本身已经有辨识度，名字也不会被挤。

## 渲染时发现并改掉的问题

1. **第一版**：右栏 255px 时，名字被挤成 "explorador" 和 ".pt" 两行。改成窄的时候只显示图标。
2. **第二版**：B 一开始设成"右栏窄于 300px 就只显示 logo"，但右栏在 1440 宽时只有 268px，所以 B 一直被缩成了 A。这也说明 B 的文字很占地方。改成窄于 240px 才缩成 logo，B 才能显示文字。

## 自动检查

`render-report.json`：29 项全部通过。

- 按钮和名字不重叠，也没有超出右栏。
- 不用滚动就能看到按钮。
- 按钮和名字第一行对齐（偏差 0–1px）。
- 窄右栏时名字保持一行。
- 只有 logo 的按钮有可读的名称和鼠标提示。
- 点 logo 能打开正确项目的「相似与搭档」。
- 手机上没有横向溢出。

检查覆盖 A 和 B、白天和黑夜、长名字、窄右栏和手机。数据来自最新已验证备份的副本，没有调用 Claude。

## 如果确认，要改的正式文件

- 新增 `business/frontend/src/components/DetectiveIcon.jsx`（侦探 logo）。
- `business/frontend/src/components/KnowledgeMaterialDetails.jsx`：见 `proposed/KnowledgeMaterialDetails.patch`。
- `business/frontend/src/match.css`：见 `proposed/match.css.patch`。选 B 时再加上 `proposed/variant-b.css` 的内容。

确认后会重建 `frontend/dist`，并重启 Lydia Remote。只改前端，不用备份数据库，停服大约半分钟。

## 需要你确认

1. **选 A 还是 B？** 我推荐 A。
2. **logo 画得行不行？** 看 `00-logo.png`。想改的话，可以说"帽子再大一点""眼睛换成放大镜"这类。
3. **工作台左边分区列表里「相似与搭档」前面的图标，要不要也换成这个侦探 logo？** 我建议换，前后一致。
