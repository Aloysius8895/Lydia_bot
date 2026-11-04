# 专家与任务编排

`worker.ts` 管理任务、检查点、暂停/取消与恢复；`research.ts` 路由专家并组合检索上下文；`prompts.ts` 定义角色输出；`skills.ts` 从权威 `../skills` 只读加载方法；`citations.ts` 复核来源与结论的关系；`providers/claude.ts` 通过本人已登录的 Claude CLI 推理。

通过 `backend` 调用，依赖与 business 同级的 `../data/RAG`、`../data/database`，以及 business 内的 `shared`。不修改专家原文、不管理用户 OAuth token；加载状态与专家行为测试分别记录。
