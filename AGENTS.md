# Chat 模块开发指引

- Chat 是独立的 Chrona 应用。宿主入口和工具合同见 `index.ts` 与 `module.json`，修改工具时核对两处。
- 浏览器从 `browser-entry.ts` 加载 `chat.tsx`。消息、工具轨迹和提问在 `thread.tsx`，设置面板在 `panels.tsx`，可复用组件在 `elements/`。
- `state.ts` 管理私有会话与执行恢复。观察事件和学习范围看 `observations.ts`，Mind 更新和任务代理分别看 `mind-updates.ts`、`mind-tasks.ts`。
- 本地离线验证用 `bun run test`，前端类型检查和打包用 `bun run build`。宿主检查、内核集成、Mind 组合测试和浏览器检查的入口及依赖见 [README 的验证章节](README.md#验证)。
- 移动发布源码或重建发布产物时核对 `chrona-material.json` 的源文件清单、产物摘要和工具链记录。

## 前端组件来源（强制）

- 新增、替换或修改聊天 UI 前，必须查阅 [shadcn AI Elements 官方文档](https://ui.shadcn.com/docs/ai-elements)对应页面的 **Base UI** 示例和安装说明，并核对它链接的 [shadcn Base UI 组件](https://ui.shadcn.com/docs/components/base)。有官方组合时必须使用该组合及当前 Base UI registry 源码。禁止从旧 `elements.ai-sdk.dev` registry、旧 Vercel 独立组件、Radix 变体或历史示例复制实现来替代当前方案。本地存在同名组件也必须核对来源和 primitive。
- 工具调用必须按 [Tool](https://ui.shadcn.com/docs/ai-elements/base/tool) 使用 `Trace`、`TraceLine`、`TraceCollapsible` 和 `CodeBlock`。Chat 按调用 ID 配对参数和结果，一次调用只渲染一条轨迹。标题直接显示工具名和可读的调用摘要，例如 `bash git status`、`read README.md`。长摘要单行截断；展开区只显示工具输出或错误。禁止把原始参数 JSON 作为默认展示，也禁止使用独立 `ToolHeader`、`ToolInput` 或 `ToolOutput` 实现这块界面。
- 用户明确指定的交互可以保留，例如弹窗式模型选择器。仍须用当前 shadcn Base UI 组件组合实现，并保留 Chat 的会话、草稿、提供方限制、键盘交互和现有多语言行为。先核对官方导出，禁止因本仓库暂无调用而删除 registry 子组件。若官方资料暂时无法核验，记录具体缺口，不以旧实现代替。
