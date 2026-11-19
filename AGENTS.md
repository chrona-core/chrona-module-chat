# Chat 模块开发指引

- Chat 是独立的 Chrona 应用。宿主入口和工具合同见 `index.ts` 与 `module.json`，修改工具时核对两处。
- 浏览器从 `browser-entry.ts` 加载 `chat.tsx`。消息、工具轨迹和提问在 `thread.tsx`，设置面板在 `panels.tsx`，可复用组件在 `elements/`。
- `state.ts` 管理私有会话与执行恢复。观察事件和学习范围看 `observations.ts`，Mind 更新和任务代理分别看 `mind-updates.ts`、`mind-tasks.ts`。
- 本地离线验证用 `bun run test`，前端类型检查和打包用 `bun run build`。宿主检查、内核集成、Mind 组合测试和浏览器检查的入口及依赖见 [README 的验证章节](README.md#验证)。
- 移动发布源码或重建发布产物时核对 `chrona-material.json` 的源文件清单、产物摘要和工具链记录。
