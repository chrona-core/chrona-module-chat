# Chat

Chat 是 Chrona 的独立中文对话工作台，管理自己的会话、草稿、图片、工具选择和执行记录。对话通过 Chrona Agent 与已安装的 Provider 执行；界面通过 Web 的标准组件与页面注册机制提供。

使用前需要已配置且可用的对话 Provider，以及已安装并绑定的 Web 应用。Chat 的入口、权限与工具声明见 `module.json`；应用激活时注册 `chat:Workbench` 组件和 `main` 工作区页面。

## 使用

- 在 Chat 页面新建或切换会话。会话支持搜索、重命名、置顶、归档及确认删除。
- 在“工具与设置”中选择对话提供方、应用工具，并在输入区选择下一轮模型和思考强度。新会话默认选择当前可委派的应用工具；每轮最多 100 个，超出时可关闭工具后手动选择。设置变更用于下一轮。
- 输入消息后点击“发送”，或按 `Ctrl / ⌘ + Enter`。支持 PNG、JPEG、GIF、WebP 图片，每张最多 2 MiB、每会话最多 10 张；Provider 需支持图片输入。
- 运行中可以补充指令、回答交互问题或请求停止。请求结果未知时，在“执行详情”中按原请求核对。停止请求与任务观测状态分别保存；停止尚未确认时继续保留占用。
- “新执行上下文”保留 Chat 消息，并让后续执行使用新的 Provider 上下文。“应用交付”按提交回执核对应用状态；提交、批准、激活和浏览器验收分别显示。

会话及操作记录保存在宿主提供的应用私有数据目录内的 `chat.sqlite`，图片保存在应用私有内容目录。浏览器还会保存本机草稿，以便恢复尚未完成保存的输入。应用不使用固定的工作区路径或数据目录。

## 开发与构建

在本目录运行，使用 Bun 和锁定依赖：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run test
```

`bun run build` 先检查严格 TypeScript，再用 Vite 构建 `dist/ui.js` 和 `dist/ui.css`。构建需要 Bun 和 Node.js（20.19+ 或 22.12+）。工作台按 AI Elements 的 Chat、Prompt Input、Model Selector 和 Tool 示例组合组件。会话导航、弹窗、筛选和表单使用 shadcn/ui。`elements/` 保存项目使用的 registry 组件，适配了本地导入、中文标签和 Web 的 portal 容器。`index.ts` 在激活时注册两个制品。`chrona-material.json` 列出源码、构建命令及产物摘要；修改或重建产物后应同步摘要和实际使用的工具链版本。

主要文件：

| 文件 | 职责 |
| --- | --- |
| `index.ts`、`module.json` | 应用入口、工具合同与 Web 注册 |
| `state.ts` | 私有会话存储、操作快照与执行恢复 |
| `observations.ts`、`mind-updates.ts`、`mind-tasks.ts` | 持久观察事件与学习范围、Mind 更新读取与任务代理 |
| `tool-selection.ts`、`delivery.ts` | 工具发现与选择、交付回执识别 |
| `chat.tsx` | React 挂载、会话导航、输入与命令恢复 |
| `thread.tsx` | AI Elements 消息、工具轨迹、图片与 Agent 提问 |
| `panels.tsx` | 工具设置、Mind 学习范围、交付回执 |
| `elements/`、`ui.css` | shadcn/ui 组件源码和应用局部样式 |
| `test-support/` | Web 注册测试工具与浏览器预览样式夹具 |

## 验证

| 验证 | 入口 | 依赖 |
| --- | --- | --- |
| 离线套件 | `bun run test` | 本仓库依赖和 `bun run build` 产出的 Web 制品。覆盖会话状态、Agent 准入、回执恢复、Web 注册、Mind 观察和任务代理。 |
| Chrona 应用检查 | `module.json` 声明的 `test.ts` | 由 Chrona 应用检查流程提供 `chrona/testing` SDK 进程测试工具。 |
| Chrona 内核集成 | `host-agent.integration.test.ts`，运行命令见下方 | 同级 `../Chrona` checkout、已安装的内核依赖、已生成的 Prisma 客户端和临时 SQLite 数据库。使用离线 Provider 替身。 |
| Chat 与 Mind 组合测试 | `bun test ./integration/chat-mind-updates.bun.test.ts` | 同级 `../chrona-module-mind` checkout 及其依赖。 |
| 浏览器检查 | `browser-check.js`，预览步骤见下方 | 前端构建产物、本地 HTTP 服务和 Playwright CLI。 |

内核集成测试会在导入数据库模块时初始化数据库。从本目录运行时指定同级 Chrona checkout 的迁移目录，并隔离数据库和配置。

```sh
(
  mkdir -p node_modules/.cache
  test_dir="$(mktemp -d "$PWD/node_modules/.cache/chat-host-test.XXXXXX")"
  trap 'rm -rf "$test_dir"' EXIT
  TMPDIR="$test_dir" \
  CHRONA_CONFIG_DIR="$test_dir/config" \
  DATABASE_URL="file:$test_dir/root-test.db" \
  CHRONA_MIGRATIONS_DIR="$PWD/../Chrona/packages/db/prisma/migrations" \
  bun test ./host-agent.integration.test.ts
)
```

浏览器预览运行 `bun run build` 和 `bun run browser-fixture.ts`，然后通过本地静态 HTTP 服务打开 `browser-fixture.html`。用 `playwright-cli run-code --filename=browser-check.js` 运行检查，覆盖三个视口和明暗主题、空白页直接发送首条消息、工具弹窗打开时导航位置稳定、就地选择模型、按应用配置工具、运行中增量正文、工具调用结果配对、刷新后核对原发送、运行中补充和停止、提问及归档恢复。预览使用合成数据和宿主样式夹具。
