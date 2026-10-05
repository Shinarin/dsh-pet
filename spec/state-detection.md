# Spec: DSH 会话状态检测（state-detection）

> 依据 DSH 桌面版 44.0.0（runtime 0.2.0-rc.2）解包源码全量摸排修订。
> 源码出处格式：`chat:行号` = `@deepseek-ai/dsh-client-ui-chat/lib/client.js`，
> `conv` = ui-conversation，`tool` = ui-tool，`approval` = ui-approval，
> `user-questions` = ui-user-questions，`agent-loop` = dsh-agent-loop/lib/index.js。

## 1. 产品规则

桌宠跟随 DSH 当前会话状态切换 GIF，状态优先级从高到低：

| 优先级 | 状态 | 含义 | 检测依据（DSH 前端真实 DOM 契约） |
|-------|------|------|--------------------------------|
| 1 | `approval` | 有待用户处理的交互（工具审批 / 提问 / 计划评审） | `[data-approval-key]`（approval:83）、`[data-question-key]`（user-questions:1007）、`[data-plan-review-key]`（user-questions:544）任一可见。检测到后保持 2 秒粘性，避免 React 重渲染闪烁 |
| 2 | `answering`（设置面板标签「编辑中」） | AI 正在产出：文本流式输出、工具准备/执行中（写文件、编辑、跑命令） | 任一可见：`div[data-streaming]`（AssistantMarkdown 根，chat:5957）、`[data-tool][data-state="running"]` 或 `[data-tool][data-state="preparing"]`（ToolRow，tool:278/1716-1720） |
| 3 | `thinking` | 会话运行中但无文本/工具产出（等待首个 token、**reasoning 深度思考流式**、步骤间隙、模型重试、压缩等） | 排除法：`[data-chat-running]` 可见（chat 视图尾部运行指示器，session.running 全程存在，chat:3920/5158）且不满足 answering 条件；停止按钮 `button[aria-label="停止生成"]` / `"Stop generating"` 作为旁证。reasoning 流式（`[data-variant="think"][data-state="running"]`，chat:5834-5835）按用户规则归入此状态，无需单独检测 |
| 4 | `idle` | 以上条件均不满足 | — |

DSH 状态分层事实（摸排结论）：

- **agent/session 层**：`session.running` = agent.status === "running"（agent-loop:784-792）；`maintenance`（自动压缩）对外算 idle。`sessionStatus` 聚合 `{ running, pendingInteraction, completionUnread }`，pendingInteraction kind = approval / question / plan-review。
- **turn 层**：`open` / `closed`；结束 reason = completed / aborted / error / max-tokens。
- **assistant-step 层**：`running` / `settled` / `interrupted`（chat:7602）。**关键坑：无可见块时节点不渲染（chat:7681），纯工具调用的 step 不产生助手气泡（chat:7432-7436）——所以「AI 正在写文件/执行工具」期间 `data-streaming` 缺席，必须靠 `[data-tool][data-state]` 检测。**
- **tool-call 层**：`preparing`（参数流式生成中）/ `running`（已派发执行）/ `stopped` / `error` / `ok`（tool:278）。
- 停止按钮**不可靠**：主会话 running 但输入框已有草稿时，主按钮变为「排队发送」，停止按钮完全消失（conv:17407）；审批接管 composer 时整个输入栏被替换。`[data-chat-running]` 才是全程运行信号。
- 审批期间输入栏与停止按钮均不渲染（approval 以 composer 槽位接管输入区，approval:344-354）。

已知边缘（接受，不处理）：

- 用户切到 Trajectory 标签页时 chat 视图 DOM 整体缺席 → 表现为 idle。
- 自动压缩（maintenance）期间 `session.running=false` → 表现为 idle。
- 嵌入子会话（subagent 面板）的同类标记也会被文档级选择器命中，桌宠合并反映所有会话的活动。
- aria-label/按钮文案随 locale 变化（zh/en），选择器一律优先 `data-*`。

## 2. 状态所有者

- 唯一状态所有者：客户端 `DshStateDetector`（client.js）。
- 它通过 MutationObserver + 500ms 轮询读取 DOM，仅在状态变化时回调 `PetController.setState()`。
- `PetController.currentState` 是渲染侧唯一状态，GIF 选择完全由它决定。禁止其他模块直接改写。

## 3. 接口

- `new DshStateDetector(onStateChange: (state: "idle"|"thinking"|"answering"|"approval") => void)`
- 内部检测方法（均返回 boolean）：
  - `checkApproval()` — `[data-approval-key]` / `[data-question-key]` / `[data-plan-review-key]` 可见
  - `checkProducing()` — `div[data-streaming]` / `[data-tool][data-state="running"|"preparing"]` 任一可见（reasoning 流式按产品规则归 thinking，不在此列）
  - `checkBusy()` — `[data-chat-running]` 可见，或停止按钮（aria-label 精确匹配）可见
- 回调只在状态**变化**时触发；状态变化时输出 `[DSH-PET] DOM State` 日志（console.error 通道），含各信号布尔值。

## 4. 验收场景

1. 空闲时打开 DSH → 显示 idle GIF。
2. 发送消息 → 助手未开始输出（等首 token）时显示 thinking GIF；开始流式输出文本后切换为 answering GIF；回合结束回到 idle。
3. AI 调用工具写文件/编辑代码/执行命令期间（无文本流式输出）→ 显示 answering（「编辑中」预设）GIF，而不是 thinking。
4. reasoning（深度思考）流式输出期间 → 显示 thinking GIF（产品规则：reasoning 归「思考中」）。
5. 触发工具审批 / 用户提问 / 计划评审 → 显示 approval GIF；处理后 2 秒内回到回合对应状态。
6. 回合进行中在输入框打字（草稿非空、停止按钮消失）→ 仍保持 thinking/answering，不掉回 idle。
7. 中英文 locale 下上述切换均生效（选择器不依赖文案，`data-*` 为主）。
8. 设置面板为某状态自定义 GIF 后，对应场景显示自定义 GIF。
