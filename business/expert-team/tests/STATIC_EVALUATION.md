# 静态格式与原版 Nuwa 检查

实际执行原脚本：系统skill-creator/scripts/quick_validate.py；本地Nuwa/scripts/quality_check.py与merge_research.py。未修改任一源脚本。原始stdout/stderr和退出码见static/。

| 检查 | 实际结果 | 能证明什么 |
|---|---|---|
| 六份quick_validate | 6 PASS | frontmatter、名称、描述等基础格式 |
| 五份Nuwa quality | 每份5/6；退出1 | 原版整项未通过；未检测到入口内联心智模型标题 |
| Nuwa来源比例项目 | 原脚本显示跳过 | 不是一手比例合格证明，不能将其绿色PASS当实际核验 |
| 五份merge | 脚本执行退出0，但底稿URL计数无效 | 六维笔记以S编号回链来源目录，不内嵌全部URL；脚本不能据此统计真实独立来源 |
| 技能相对链接 | 0缺失 | 文件路径存在，不证明内容有效 |
| methods/cases的完整S编号 | 0悬空 | 引用ID在本角色sources.json中存在 |

原版quality用正则找SKILL.md内模型标题，而本项目将专业方法外置references/methods.md、对跨域证据不足者保留启发式。不为提高字符串计数改名凑3–7个模型；该项保留FAIL，并将本构建标用途适配，不冒充Nuwa原版全项通过。原版风格、张力等字符串计数同样只作提示，语义与来源比例另有人工分类和独立原文复核。

初次自定义报告脚本曾在最后控制台打印中文时失败，已设stdout为UTF-8后成功重跑。六份quick_validate与原版脚本子进程一直使用UTF-8环境。详见REVISION_LOG。后续持久化检查由verify_persisted_case.py单独运行，绝不混作LLM方法题通过。

未进行原生技能安装、平台自动发现、跨平台loader注册或全局配置修改。已验证的“加载”限实际工具读取文件进入独立agent上下文。真实市场与真人验证均未运行。
