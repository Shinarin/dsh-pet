# 开发日志

## v1.0.0（当前）

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
