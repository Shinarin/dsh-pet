# dsh-pet 开发文档

## 项目概述

DSH 桌宠插件，在 DSH（DeepSeek Harness）界面右下角显示浮动宠物 GIF，跟随会话状态自动切换。

## 技术栈

- **服务端**：Node.js ES Module，Cordis 框架
- **客户端**：原生 JavaScript（无构建），React 用于设置面板
- **状态检测**：DOM MutationObserver（不依赖特定后端服务）
- **GIF 服务**：HTTP 静态文件路由

## 目录结构

```
dsh-pet/
├── package.json          # 插件元数据，声明 bundle 和 client 注入
├── cordis.patch.yml      # Cordis 层配置：将插件插入 layer 栈
├── lib/
│   └── index.js          # 服务端入口：GIF 路由 + 配置持久化
├── client.js             # 客户端入口：浮动宠物 UI + 设置面板
├── default-gifs/         # 内置默认 GIF（idle/thinking/answering/approval）
├── docs/
│   └── settings.png      # 设置面板截图（来自原项目参考）
├── scripts/
│   ├── ws_probe.py       # WebSocket 探测脚本（原项目参考）
│   ├── ws_probe_sv2.py
│   └── ws_probe_v3.py
├── development.md        # 本文件
├── devlog.md             # 开发日志
├── debug.md              # 坑点记录
└── handoff/              # 进度交接
```

## 核心模块职责

### lib/index.js（服务端）

- 注册 HTTP 路由：
  - `GET /pet/state` — 返回当前状态（始终 idle，客户端自行检测）
  - `GET|POST /pet/config` — 读取/保存用户配置到 `~/.dsh/plugins/dsh-pet/config.json`
  - `GET /pet/default-gif/{idle,thinking,answering,approval}` — 提供 GIF 文件

### client.js（客户端）

主要组件：

| 组件 | 职责 |
|------|------|
| `createPetOverlay()` | 创建固定定位的 DOM 浮层（img + hearts + dot + fallback） |
| `DshStateDetector` | MutationObserver + 轮询，检测 DSH UI 状态 |
| `PetController` | 管理 GIF 渲染、拖动、点击交互、状态切换 |
| `SettingsSection` | React 设置面板，调整大小、开关、GIF 自定义 |

### 状态检测逻辑

客户端通过 DOM 观察推断 DSH 会话状态。检测依据为 DSH 前端的真实 DOM 契约
（`data-*` 属性 / `aria-label`，详见 `spec/state-detection.md`）：

| 优先级 | 检测条件 | 状态 |
|-------|---------|------|
| 1 | `[data-approval-key]` 元素可见，或「拒绝」+「允许一次」按钮同时存在（2 秒粘性） | `approval` |
| 2 | 存在可见的 `[data-streaming]` 元素（AssistantMarkdown 流式渲染根节点） | `answering`（设置面板标签「编辑中」） |
| 3 | 存在可见的 `button[aria-label="停止生成"]` / `button[aria-label="Stop generating"]`（回合运行且可中断时渲染） | `thinking` |
| 4 | 以上都不满足 | `idle` |

注意：DSH 使用 CSS Modules 哈希类名，停止按钮为纯图标按钮（无文本），
输入框为 Lexical contenteditable——基于类名子串、按钮文本、输入框 disabled
的旧检测方式均不可用（见 `debug.md` 第 8 条）。

## 运行与构建

### 本地开发

1. 项目目录：`C:\Users\da270\.dsh\plugins\dsh-pet`
2. 直接修改代码
3. **完全退出并重启 DSH** 使改动生效

### 安装方式

**方式 1：GitHub 地址（推荐）**
```
dsh plugin add github:Shinarin/dsh-pet
```

**方式 2：本地路径**
```
dsh plugin add C:/Users/da270/.dsh/plugins/dsh-pet
```

### 重启后测试

- 发消息给 AI → 观察 GIF 切换（idle → thinking → answering → idle）
- 触发 approval → 观察 approval.gif
- 单击桌宠 → 爱心飘出
- 拖动桌宠 → 位置保存到 localStorage

## 关键配置

- `dsh-pet:visible` — localStorage，控制显示/隐藏
- `dsh-pet:position` — localStorage，保存拖动位置
- `dsh-pet:config` — localStorage，保存设置（大小、提醒等）
- `dsh-pet:gif:{state}` — localStorage，保存自定义 GIF（base64）
- `~/.dsh/plugins/dsh-pet/config.json` — 服务端持久化配置

## 注意事项

- 客户端 bundle 通过 `window.__ModuleLoader__.load()` 加载
- `console.error` 用于调试日志（生产环境可见）
- GIF 通过 blob URL 预加载，避免 Electron 自定义协议问题
