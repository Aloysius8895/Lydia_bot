# 项目更名为 Lydia

用户指定将项目从 Crew 更名为 lydia。产品展示统一为 Lydia，包名使用小写 lydia。范围：侧栏、登录/加载/手机界面、HTML title、PWA name/short_name、报告下载名、启动日志、包与 lock 元数据、运行说明和启动文件。

保持当前目录、数据库、案件和专家名称不变。主题使用 lydia-theme，并向后读取 crew-theme，保留原选择；新 Service Worker 使用 lydia 前缀并清理本应用旧 crew 缓存。旧 Start-Crew.cmd 委托 Start-Lydia.cmd，旧 CREW_DATA_DIR 继续兼容。会话 cookie、已有证书文件及历史设计/测试原文保留原标识，避免改名导致登录或信任中断。

构建和类型检查后运行浏览器验证，检查 Lydia 的实际标题/品牌/manifest、旧主题迁移、公开资源缓存及既有操作流程。报告只依据实际运行，不代表真实专家或手机安装验收。
