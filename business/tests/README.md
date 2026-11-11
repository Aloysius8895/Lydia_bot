# 自动化功能测试

Drive 手动单批专项：`node --experimental-strip-types --test --test-concurrency=1 tests/drive-manual.test.ts tests/file-import.test.ts tests/knowledge.test.ts`，24 项通过。使用生成的临时测试密钥、模拟 Drive 与隔离 PGlite，不接触实际凭据或正式库；验证 CurrentUser DPAPI 加解密、只读 scope、无域级委派、401 续取、脱敏错误、精确 file ID、同名交付、ready 冲突、越界、权限、哈希、大小/条数、稳定 ID、收据及真实临时库搜索。实际服务账号、Grok 上传和真实 Drive 链路仍待本人配置后联调；详见 `data/docs/DRIVE_MANUAL_ACCEPTANCE.md`。

JSON 文件导入专项：`node --experimental-strip-types --test --test-concurrency=1 tests/file-import.test.ts tests/knowledge.test.ts tests/local-access.test.ts`。2026-11-09 共 16 项通过，覆盖共享主报道和辅助竞赛链接的作品身份、重复批次、稳定 ID/URL 冲突、原数据不覆盖、非法字段逐条失败、摘要与原文隔离，以及知识库权限和既有流程。正式入库验收独立记录于 `../docs/acceptance/2026-11-09-grok-file-import.md`，不能用隔离测试代替真实入库。

在 business 根运行 `npm.cmd test`；类型检查用 `npm.cmd run check`，浏览器检查用 `npm.cmd run test:browser`。

这些测试使用 TEST_ONLY 资料、独立数据库和模拟模型，验证权限、隔离、检索、CLI 适配及任务恢复等控制流程。它们不证明真实五专家表现、市场需求或手机安装已通过。报告放在 `../test-results`。
