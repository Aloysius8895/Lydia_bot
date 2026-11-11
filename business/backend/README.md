# 后端服务

`server.ts` 为统一启动入口，提供 API 并根据 Vite manifest 服务 `frontend/dist`；这是用户原有 frontend/src React 设计的构建结果。`auth.ts` 处理本地 owner 设置、登录、会话与 CSRF；`export.ts` 输出版本化研究快照到根目录 cases。

在 business 根运行 `npm.cmd start` 或 `Start-Lydia.cmd`，启动前自动构建前端。默认仅监听 <http://127.0.0.1:4318>。直接运行 server.ts 前需先执行 `npm.cmd run build:frontend`。路径由 shared/config.ts 定义，数据库在 `../data/data_storage/database`，不是本目录下的临时副本。源码、环境文件及构建 manifest 不向浏览器提供。
