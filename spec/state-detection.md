# Spec: DSH 会话状态检测（state-detection）

## 1. 产品规则

桌宠需跟随 DSH 当前会话状态切换 GIF，状态优先级从高到低：

| 优先级 | 状态 | 含义 | 检测依据（DSH 前端真实 DOM 契约） |
|-------|------|------|--------------------------------|
| 1 | `approval` | 有待审批请求 | 存在可见的 `[data-approval-key]` 元素；或同时存在文本为「拒绝」/「Reject」与「允许一次」/「Allow once」的按钮。检测到后保持 2 秒粘性，避免 React 重渲染闪烁 |
| 2 | `answering`（设置面板标签「编辑中」） | 助手正在流式输出文本/推理 | 存在可见的 `[data-streaming]` 元素（AssistantMarkdown 流式渲染根节点，`streaming=true` 时出现） |
| 3 | `thinking` | 回合进行中但尚未流式输出（分析请求、调用工具等） | 存在可见的 `button[aria-label="停止生成"]` 或 `button[aria-label="Stop generating"]`（回合运行且可中断时 DSH 才渲染该按钮） |
| 4 | `idle` | 以上条件均不满足 | — |

关键事实（来自 DSH 前端源码 `dsh-client-ui-conversation` / `dsh-client-ui-chat` 核实）：

- 停止按钮是**纯图标按钮**，无文本内容，只有 `aria-label="停止生成"`（英文 locale 为 `"Stop generating"`）。按按钮文本检测永远失败。
- DSH 使用 CSS Modules 哈希类名（如 `RlGAzG_primary`），`[class*="loading"]` 等类名子串匹配永远失败。
- 输入框是 Lexical contenteditable，忙碌时 `contenteditable="false"`，没有 `disabled`/`readOnly` 属性。

## 2. 状态所有者

- 唯一状态所有者：客户端 `DshStateDetector`（client.js）。
- 它通过 MutationObserver + 500ms 轮询读取 DOM，仅在状态变化时回调 `PetController.setState()`。
- `PetController.currentState` 是渲染侧唯一状态，GIF 选择完全由它决定。禁止其他模块直接改写。

## 3. 接口

- `new DshStateDetector(onStateChange: (state: "idle"|"thinking"|"answering"|"approval") => void)`
- 内部检测方法（均返回 boolean）：
  - `checkApproval()` — `[data-approval-key]` 可见 或 拒绝/允许按钮对
  - `checkStreaming()` — `[data-streaming]` 可见
  - `checkBusy()` — 停止按钮（aria-label 精确匹配，不含发送按钮）可见
- 回调只在状态**变化**时触发。

## 4. 验收场景

1. 空闲时打开 DSH → 显示 idle GIF。
2. 发送消息 → 助手未开始输出文本时显示 thinking GIF；开始流式输出后切换为 answering（「编辑中」预设）GIF；回合结束回到 idle。
3. 触发工具审批 → 显示 approval GIF；批准/拒绝后 2 秒内回到回合对应状态。
4. 中英文 locale 下上述切换均生效（aria-label 匹配同时覆盖「停止生成」与「Stop generating」）。
5. 设置面板为 answering 状态自定义 GIF 后，流式输出时显示自定义 GIF。
