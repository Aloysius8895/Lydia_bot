# 本机免密码进入

用户已明确要求单人本机使用无需密码。设计：生产启动默认允许 loopback origin 和 loopback socket 的浏览器通过 auth/status 获得随机 HttpOnly 会话；保留 Host、Origin 和 CSRF 校验。远程入口和测试工厂默认仍使用密码。保留现有 owner 和项目资料，支持 LYDIA_LOCAL_AUTO_LOGIN=false 恢复密码。

- [x] 提取 Auth.createSession，供密码登录和本机自动进入共用。
- [x] 限定本机自动会话入口，Settings 显示实际模式并支持重置会话。
- [x] 验证免密码进入、CSRF、跨站请求拒绝和远程 origin 不放行（专项测试 2/2）。
- [x] 构建、类型检查，更新启动说明。运行中的旧服务需用户在原窗口 Ctrl+C 后重新启动。
