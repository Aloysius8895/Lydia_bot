# 运行与验证脚本

全部命令从 business 根运行。

- `audit.ts`：CLI 身份、Ollama、技能和数据库环境审计；会打开正式数据库，必须先停止当前服务，不能同时运行。
- `browser-test.ts`：临时数据库中的真实浏览器流程，生成 test-results 报告及截图。
- `retrieval-evaluation.ts`：本机 embedding/混合检索合成评估。
- `expansion-evaluation.ts`、`rerank-evaluation.ts`：查询扩展/重排对照，会调用真实 Claude CLI 并使用订阅额度。
- `prepare-https.ts`：准备本人局域网 HTTPS 证书和配置，不安装信任。
- `https-test.ts`：临时数据库中的本机 TLS、登录、Secure cookie 验证，不代表手机安装。
- `icons.ts`：生成当前 PWA 的图标。

运行 TypeScript 脚本使用 `node --experimental-strip-types scripts/<脚本>.ts`。不把测试夹具当作真实市场证据。
