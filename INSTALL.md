# 安装与使用

1. 打开 [Releases](https://github.com/nuet9/dsh-agent-chat-tabs-v2/releases/latest)，下载 `local-agent-chat-tabs-v2-2.0.0.tgz`。
2. 在 DeepSeek Harness 的 **Plugins / 插件** 中添加安装包，或者使用 Release 资产的完整 HTTPS 下载地址作为安装目标；不要直接把源码 ZIP 当成安装包。
3. 若插件管理器提示需要重启，请在保存当前任务后完整重启 Harness。检查插件 `@local/agent-chat-tabs-v2` 已启用；旧版 `@local/agent-chat-tabs` 如仍安装，应停用以免界面重叠。
4. 在主对话点击 **＋** 开启本地草稿，输入首条文本/图片并发送；成功后在标签页切换至原生子代理聊天。首次发送会实际运行模型；仅点击加号不会。

本插件不是聊天记录的跨账号同步工具。子代理为独立 Session，主聊天不会自动收到它的完整消息；同工作区内具备权限的其他会话可主动查询。图片先通过原生附件入口上传，发送须由 Harness 校验归属和当前模型的视觉能力。安装不会迁移本机历史、草稿或模型配置。

## 卸载 / 回退

在插件管理器停用或卸载本插件并按提示重启。已有原生子代理不会因为界面插件停用而被删除。不要上传用户 profile、诊断目录或开发检查点；它们可能包含本机路径及会话标识。

## 验证边界

发布前通过语法检查、四组模拟测试和压缩包文件清单校验；未在另一台机器上安装，也未完成真实浏览器/模型端到端验证。若安装失败，先核对 DSH 版本、插件管理器返回的 `application` 与 `warnings`，不要把离线测试等同于已成功加载。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
