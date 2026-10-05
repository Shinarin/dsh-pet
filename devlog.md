# 开发日志

## v1.0.0（当前）

### 2026-10-05（README 正式化与仓库瘦身）

- **README 改为正式文风**，去除表情符号与口语化表达
- **.gitignore 排除 Agent 协作与本地文件**：`AGENTS.md`、`handoff/`、`scripts/`（早期 WebSocket 探测遗留）、`temp-test.txt`、`private.md`；仓库仅保留运行所需与开发文档
- **开发文档脱敏**：development.md、debug.md 中的本机用户名路径替换为占位符
- **同步 development.md**：状态检测表更新为 44.0.0 摸排后的新契约（旧表已过时）；目录结构标注本地不入库文件

### 2026-10-05（README 重写）

- **重写 README.md**：补充状态-GIF 对应表（含最新 reasoning 归思考中规则）、交互说明（单击/双击/右键/拖动）、位置锚定说明、设置项详解表（如实标注「完成提醒」未接入触发）、自定义 GIF 建议、FAQ、修正「工作原理」为真实 DOM 契约（旧版残留 spinner/输入框禁用等失效描述）

### 2026-10-05（reasoning 归入思考中）

- **规则调整**：reasoning（深度思考）流式输出从「编辑中」改归「思考中」——`checkProducing()` 移除 `[data-variant="think"][data-state="running"]`，该场景经排除法落到 thinking（`[data-chat-running]` 在场）；「编辑中」现在只覆盖文本流式输出与工具执行

### 2026-10-05（状态检测校准：全状态摸排）

- **修复「写入/工具执行期间显示思考中 GIF」**：纯工具调用（写文件/编辑代码）期间 assistant-step 无可见文本块，DSH 不渲染 `[data-streaming]`（ui-chat:7681/7432），检测错误落到 thinking
- **DSH 44.0.0 全状态摸排**（解包 app.asar 核实）：assistant-step = running/settled/interrupted；tool-call = preparing/running/stopped/error/ok（`[data-tool][data-state]`，tool:278）；turn = open/closed；session.running 经 `[data-chat-running]` 全程可查（chat:3920）
- **检测契约修订**（spec/state-detection.md）：
  - `answering` = AI 正在产出：`div[data-streaming]`（文本流式）或 `[data-variant="think"][data-state="running"]`（reasoning 流式）或 `[data-tool][data-state="running"/"preparing"]`（工具执行）任一可见
  - `thinking` = 会话运行但无活跃产出：`[data-chat-running]` 可见为主，停止按钮仅作旁证（输入框有草稿时停止按钮消失，conv:17407）
  - `approval` 扩展覆盖 `[data-question-key]` / `[data-plan-review-key]`（提问/计划评审同样需要用户操作）
- **已知边缘（接受）**：Trajectory 标签页激活时 chat DOM 缺席表现为 idle；自动压缩（maintenance）期间 session.running=false 表现为 idle；嵌入子会话标记会合并反映

### 2026-10-05（位置锚定修复）

- **修复重启后桌宠不显示**：旧位置以绝对像素 `left/top` 保存，窗口尺寸变化后桌宠落在视口外，需拉大窗口才可见
- **修复不跟随右下角**：拖动后定位退化为绝对像素，最大化/resize 时停在旧屏幕坐标
- **位置状态重设计**：统一存储「距右下角偏移量」`{right, bottom}`，拖动松手换算保存，加载/resize/缩放时始终锚定右下角并钳制在视口内；旧 `{x, y}` 存档自动迁移

### 2026-10-05（默认位置调整）

- **默认锚点改为窗口右下角**：未拖动过时，桌宠默认距右边缘 100px、距下边缘 200px（原 bottom:120px/right:220px）；新增 `spec/overlay-position.md`

### 2026-10-05（状态检测修复）

- **修复状态检测全面失效**：harness 工作时桌宠不切换「编辑中」/thinking GIF。根因：DSH 停止按钮为纯图标按钮（文本在 aria-label）、CSS Modules 哈希类名使类名匹配失效、Lexical 输入框无 disabled 属性
- **改用真实 DOM 契约**：`answering` = 可见 `[data-streaming]`；`thinking` = 可见 `button[aria-label="停止生成"/"Stop generating"]`；`approval` 逻辑不变
- **依据**：解包 DSH `app.asar`，核实 `@deepseek-ai/dsh-client-ui-chat` / `dsh-client-ui-conversation` / `dsh-client-ui-approval` 前端源码
- **新增** `spec/state-detection.md`；移除失效的 checkStopButton/checkLoading/checkInputDisabled/checkAnswering 启发式

### 2026-10-05

- **重命名插件**：`dsh-kimi-pet` → `dsh-pet`，移除所有 kimi 相关标识
- **DSH 化改造**：移除 Kimi Code 引擎（kimi.js），改用 DOM 状态检测
- **建立 Git 仓库**：推送到 GitHub，支持 `dsh plugin add` 安装
- **修复 visible 开关**：设置面板直接调用 `window.__DSH_PET_CONTROLLER__`，双重保险
- **修复 answering 误判**：保守化检测逻辑，限制在 chat 区域内搜索
- **增大爱心**：22-40px → 44-80px
- **建立文档**：development.md、handoff、devlog.md、debug.md

### 2026-10-05（早期）

- **修复 approval 动画**：离开 approval 状态时停止弹跳动画
- **增加 approval 粘性**：检测到 approval 后保持 2 秒，避免 React 重渲染导致闪烁
- **添加 approval 状态检测**：支持 `data-approval-key` 和按钮文本匹配
- **修复爱心不显示**：heartsContainer 添加 z-index，修复 SVG className 类型问题
- **修复 GIF 显示**：从服务端 blob URL 预加载，解决 Electron 协议问题
- **添加默认位置**：bottom: 120px, right: 220px（左移 200px，上移 100px）
- **移除关闭按钮**：只能通过设置面板控制显示/隐藏
