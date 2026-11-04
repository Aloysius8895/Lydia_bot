# 迁移与容器准备

这是本地镜像构建配方，不是云部署成功记录。未选择云供应商，不创建资源，不启用 Neo4j。镜像未安装 Chrome，因此浏览器获取不可用；本机受限浏览器路径已验证。

在工作区根执行 `docker build -f crawl/deployment/Dockerfile -t lydia-crawl:local .`。构建包含现有前端和共享后端，不另起数据库服务。

默认服务仍只监听容器内 127.0.0.1。需要从宿主或其他设备访问时，使用现有受信任 TLS 配置：挂载证书和私钥，设置 HOST=0.0.0.0、APP_ORIGIN=https://实际域名:4318、HTTPS_KEY_FILE 和 HTTPS_CERT_FILE，再映射端口。不得通过关闭既有 Host/Origin/TLS 检查开放服务。镜像不包含用户证书、真实数据库或凭证。

持久卷挂载 `/app/runtime`，必须可被镜像内 node 用户写入。Ollama 默认地址在容器内部；需要另配可访问地址及目标机器实际可用模型。Claude CLI 未装入镜像，商业专家推理属于额外运行依赖；基础爬虫不需要它。

## 迁移契约

未来 DeploymentProvider 需要提供 plan/validate、deploy、status、start、stop、logs、backup、restore、rollback。未配置供应商应返回 `CLOUD_PROVIDER_UNCONFIGURED`，不得伪造成功部署器。当前没有该运行时 provider，不能调用 cloud deploy。

迁移顺序：停止本地新任务领取 → 安全关闭唯一 PGlite 所有者 → 备份数据库和快照/导出 → 记录文件哈希、任务数量、实体版本和 outbox 检查点 → 复制到目标持久卷 → 使用兼容 Node/PGlite 版本启动单一后端 → 校验计数、哈希、引用和小批任务 → 切换执行权。本地和目标不得同时领取同一数据目录中的任务。

失败时先停止目标服务，再还原原始数据库及快照的同一备份；不能将迁移后库拷回仍运行的本地实例。停止云进程不保证停止计费，清理资源需按实际供应商核对。

环境变量示例：`LYDIA_DATA_DIR`、`LYDIA_CRAWL_STORAGE_DIR`、`HOST`、`PORT`、`APP_ORIGIN`、`HTTPS_KEY_FILE`、`HTTPS_CERT_FILE`、`OLLAMA_URL`、`EMBEDDING_MODEL`。密钥与 Cookie 不写示例文件。
