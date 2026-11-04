# 五专家研究团队执行计划

**Goal:** 建立有来源、有边界、可按文件加载和实际测试的 Hackathon 缺口研究能力。

**Architecture:** 每个人物为自包含目录，精简 SKILL.md 按需引用方法、案例与来源；主控维护共享案件台账和选择关卡。制作状态与研究状态分开。

**Tech Stack:** Markdown、JSON、Python 标准库、本地 Nuwa 只读脚本、web、独立测试 agent。

用户任务规格已批准，按 brainstorming 做范围核对，按 writing-plans 保存计划；不另设审批或提交 Git。

## 执行任务

- [x] 核对本地 Nuwa 与必要模板、路径、授权、现有产物。
- [x] 依次制作 Steve → Ash → Teresa → April → Bob。各8–9份正文、来源/方法/案例/六维记录保存；弱维度如实记录。
- [x] 五位独立方法答题与另行原文评分已运行，保留材料重叠与非留出限制；TT修订后复测。
- [x] 前两位最小交接已执行并保存，随后完成其他三位。
- [x] 主控、四模板、独立TEST_ONLY案件已生成。
- [x] 团队12行为题与普通AI12同输入对照已独立运行和评分，六案六维比较齐备；未观测净通过率提升。
- [x] 两个独立精炼视角、3个新prompt干跑与建议整合；主控精炼轮2三题及实际恢复通过。
- [x] 原版Nuwa及skill-creator格式检查已运行，原始报告保留；原版5/6不改写通过，链接/来源ID另核验通过。
- [x] TEAM_GUIDE、测试报告与BUILD_STATUS汇总；自动发现与真实市场验证仍明确未运行。

## 可复核文件

用户后续指定技能根目录为 `../skills`（相对本计划）。`../skills/<name>/SKILL.md`：触发、输入、动作、边界、交接；各技能内 `references/source-index.md` 与 `sources.json`：按正文而非搜索摘要计数；`methods.md`：规则七要素；`cases.md`：原始案例和限制；`research/01–06`：Nuwa 六维底稿。`tests/inputs.json` 与 `tests/*output*`：测试输入和实际输出；`tests/*EVALUATION.md`：独立评估与差异。缺资料写 PARTIAL，不以空文件凑完成。
