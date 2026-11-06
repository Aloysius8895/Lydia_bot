# 资料侧栏实际截图

延续已确认的浅色柔和设计。实际 React 页面，使用临时 TEST_ONLY 项目和资料。

- desktop-empty.png：添加卡片、三种入口、独立检索与空资料库。
- desktop-file.png：文件选择卡、文字预览与项目资料分类。
- desktop-library.png：已添加资料，MARKET 与 PROJECT 明确区分。
- desktop-dark.png：深色模式。
- mobile.png：390px 不透明详情抽屉，无横向溢出。
- report.json：专项验证结果。

原资料方式改为粘贴文字、上传文件、网页链接。文本格式/大小限制保留，上传文件可预览编辑，网页沿用原抓取 API 并传递当前选择的资料类别。PROJECT 背景单独显示、不计市场证据；检索仍查询当前项目的市场资料。URL 测试使用请求替身，未实际访问外部网页；无模型、音频或正式数据库调用。
