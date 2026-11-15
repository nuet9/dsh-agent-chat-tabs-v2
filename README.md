# Agent Chat Tabs v2 for DeepSeek Harness

在主对话与原生子代理对话之间切换的插件。点击 **＋** 先打开本地待发送草稿；首次真实发送才创建可继续对话的子代理，之后在原生对话界面续聊。主对话不会自动显示子代理的全部聊天记录。

## 主要功能

- 每个主对话树有一个本地待发送草稿；切换回来可以继续输入，刷新后不保证保留。
- 首条消息支持文本、PNG/JPEG/WebP/GIF 图片或仅图片；最多 16 张，实际大小和像素限制由 Harness 校验。
- 首发携带主会话最近至多 8 条已完成的 user/assistant 消息、最多 12 KiB 的历史正文；当前消息作为独立首条发送。更早历史不自动加载。
- 主对话、用户创建的子对话和折叠的任务代理分组展示；切换标签不会终止运行中的代理。
- 未知提交结果只查询同一请求，避免重复创建代理；首次发送按正常模型/工具调用计费，点击 **＋** 不请求模型。

## 安装

下载 [最新 Release](https://github.com/nuet9/dsh-agent-chat-tabs-v2/releases/latest) 的 `local-agent-chat-tabs-v2-2.0.0.tgz`，在 DeepSeek Harness 的插件管理中按本地安装包或其完整 HTTPS 地址安装。完整步骤见 [INSTALL.md](INSTALL.md)。包名 `@local/agent-chat-tabs-v2`；安装或更新后可能需要完整重启 Harness 才能载入 Host/Client 模块。不要删除已安装版本所链接的源目录。

## 验证与限制

源码通过 `node --check index.js`、`node --check client.js` 以及 `node test.mjs`、`node host.test.mjs`、`node regression.test.mjs`、`node image.test.mjs` 四组离线测试。测试模拟 Host/Client，不调用真实模型。浏览器端到端、实际付费创建、真实图片首发、重启后的焦点和草稿行为尚未完成实机验收。发布包只含运行文件和语言资源；不含本机检查点、诊断文件、历史会话、凭据或用户图片。

## 开发

Node.js 22+ 环境执行上述测试。`package.json` 的 `files` 白名单限定运行时发布文件；不需要安装第三方 npm 依赖。停用插件不删除已经归原生 Harness 管理的代理。源码公开并不等于承诺与任意 Harness 版本兼容；如当前部署缺少原生会话、附件或 Client Slot 接口，应先检查版本与插件加载结果。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
