# 坑点记录

## 1. Electron 自定义协议无法加载 GIF

**现象**：桌面版 DSH 中 `<img src="/pet/default-gif/idle">` 显示 broken image
**根本原因**：DSH 桌面版使用 `dsh-app://app/` 自定义协议，`<img>` 标签的 GET 请求没有 Origin 头，但某些情况下后端返回 503
**解决方案**：客户端用 `fetch()` 获取 GIF 为 blob，创建 `URL.createObjectURL(blob)` 作为 `<img>` 的 src
**关键代码**：
```javascript
const r = await fetch(`${API_BASE}/default-gif/${state}`);
const blob = await r.blob();
this.defaultGifUrls[state] = URL.createObjectURL(blob);
```

## 2. React 组件中 `<img>` 预览同样无法加载 GIF

**现象**：设置面板中默认 GIF 预览不显示
**根本原因**：同上，React 组件中的 `<img src={`/pet/default-gif/${s}`}>` 在桌面版无法加载
**解决方案**：设置面板也用 `fetch()` 预加载 blob URL 用于预览

## 3. SVG 元素的 `className` 是对象不是字符串

**现象**：DOM 诊断代码遍历元素时调用 `.slice()` 崩溃，导致整个插件不加载
**根本原因**：SVG 元素的 `className` 返回 `SVGAnimatedString` 对象，不是字符串
**解决方案**：
```javascript
function safeClassName(el) {
  if (!el) return "";
  if (typeof el.className === "string") return el.className;
  if (el.getAttribute) return el.getAttribute("class") || "";
  return "";
}
```

## 4. 拖动状态与点击事件冲突

**现象**：单击桌宠不触发摸头（`pat()` 不执行）
**根本原因**：`setupDrag()` 在 `mousedown` 时立即设置 `this.dragging = true`，`setupClick()` 的 `mouseup` 在 `el` 上执行时，`window.mouseup` 还没执行，所以 `this.dragging` 永远是 `true`
**解决方案**：`mouseup` 中不再检查 `this.dragging`，只通过移动距离判断是点击还是拖动

## 5. 设置面板 visible 开关不可靠

**现象**：设置面板中的"显示"开关点了之后桌宠没有立即响应
**根本原因**：`CustomEvent` 在 React 组件和插件主逻辑之间的传递可能不可靠（DSH HMR 重载时事件监听器可能重复注册或失效）
**解决方案**：
1. 将控制器实例挂载到 `window.__DSH_PET_CONTROLLER__`
2. 设置面板直接调用 `window.__DSH_PET_CONTROLLER__.show()` / `hide()`
3. 保留 `CustomEvent` 作为备用机制

## 6. answering 状态误判

**现象**：idle 时桌宠显示 answering.gif
**根本原因**：`[class*="cursor"]` 匹配太宽泛，会匹配到全局的 `cursor-pointer` 等元素；全局关键词搜索匹配到设置面板中的"编辑中"标签
**解决方案**：
1. 限制搜索范围在 `main` / chat 区域内
2. 输入框禁用时才进行备用 answering 检测
3. 精确匹配 `typing-indicator` / `cursor-blink` / `stream-cursor` 类名
4. 移除全局关键词搜索

## 7. `link:` 映射导致无法卸载

**现象**：DSH 插件管理器中无法卸载插件
**根本原因**：手动编辑 `profile/package.json` 使用 `"dsh-pet": "link:C:/..."`，DSH 插件管理器无法识别和卸载 link 依赖
**解决方案**：
1. 从 profile 中移除 link 配置
2. 通过 `dsh plugin add github:Shinarin/dsh-pet` 安装
3. 或通过 `dsh plugin add <本仓库的本地路径>` 本地路径安装

## 8. 状态检测全部失效：DSH 前端 DOM 与启发式假设不符

**现象**：harness 工作（生成/编辑）时桌宠永远停在 idle，不切换到「编辑中」(answering) / thinking 的预设 GIF
**根本原因**：旧检测逻辑基于三类假设，全部与 DSH 前端实际实现不符（已通过 `app.asar` 内 `@deepseek-ai/dsh-client-ui-*` 源码核实）：
1. 停止按钮是**纯图标按钮**（内部只有 SVG），无文本内容——按 `innerText` 匹配「停止生成」永远失败；文本在 `aria-label` 上
2. DSH 使用 CSS Modules 哈希类名（如 `RlGAzG_primary`）——`[class*="loading"/"spinner"/"typing"/"cursor"]` 子串匹配永远失败
3. 输入框是 Lexical contenteditable div，忙碌时 `contenteditable="false"`，没有 `disabled`/`readOnly` 属性

**解决方案**：改用 DSH 前端稳定的 `data-*` / `aria-label` 契约（spec/state-detection.md）：
- `answering`：存在可见的 `[data-streaming]`（AssistantMarkdown 流式渲染根节点，`streaming=true` 时出现）
- `thinking`：存在可见的 `button[aria-label="停止生成"]` / `button[aria-label="Stop generating"]`（回合运行且可中断时才渲染）
- `approval`：`[data-approval-key]` 可见（原逻辑已正确，保留）

**教训**：DOM 启发式检测必须先核实目标前端的**真实源码/运行时 DOM**，稳定契约是 `data-*` 属性和 `aria-label`，不是 CSS 类名（CSS Modules 哈希化）和按钮文本（图标按钮 + i18n）。

## 9. 状态检测分层不全：工具执行期间 `data-streaming` 缺席

**现象**：AI 调用工具写文件/编辑代码时，桌宠显示 thinking（思考中）而非「编辑中」预设 GIF
**根本原因**：检测把 `answering` 等同于「文本流式输出」（`[data-streaming]`），但纯工具调用的 assistant-step **无可见文本块，节点不渲染**（ui-chat:7681、7432-7436），`data-streaming` 缺席 → 落到 thinking。DSH 的实际状态是分层的：assistant-step（running/settled/interrupted，chat:7602）与 tool-call（preparing/running/stopped/error/ok，tool:278）各自独立。
**解决方案**（DSH 44.0.0 源码摸排后修订，见 spec/state-detection.md）：
1. `answering` 改判「正在产出」：`div[data-streaming]`（文本）∨ `[data-variant="think"][data-state="running"]`（reasoning）∨ `[data-tool][data-state="running"/"preparing"]`（工具）
2. `thinking` 主信号改用 `[data-chat-running]`（session.running 全程存在，chat:3920）；**停止按钮不可靠**——输入框有草稿时主按钮变「排队发送」，停止按钮消失（ui-conversation:17407）
3. `approval` 扩展 `[data-question-key]` / `[data-plan-review-key]`
4. 勿用裸 `[data-state="running"]`：ReasoningRow 也用 data-state，需 `[data-tool]` 前缀限定

**教训**：「流式输出」只是 agent 活动的一种形态；检测「AI 在干活」要覆盖文本流式、reasoning 流式、工具执行三条路径。另外 ripgrep/Grep 默认遵守 .gitignore，搜索解包到 `.tmp/` 的 asar 源码必须 `include_ignored: true`，否则会误报"不存在"。

## 10. link: 改装 github: 时 pnpm 穿透 junction 删除目标目录并挂起（Windows）

**现象**：DSH 桌面端用 `github:Shinarin/dsh-pet` 安装失败；profile 日志（`profiles/<name>/.plugin-manager/logs/operation-*/pnpm.log`）停在 `Packages: +1 -1` 之后，没有 `Done in ...`，`node_modules` 下残留 `dsh-pet_tmp_*` 暂存目录。
**根本原因**：profile 里存在同名包的 `link:` 安装遗留的 junction（`node_modules/dsh-pet -> <本地目录>`）。DSH 内置 pnpm 11.7.0 替换它时**不按 junction  unlink，而是解析 realpath 后递归删除目标目录内容**——在复现实验中把插件工作副本的 `.git` 删到只剩 `objects/`、`refs/`，进程挂起超过 4 分钟不退出，最终被插件管理器/用户打断，安装半途中止。
**解决方案**：
1. 先彻底移除旧来源：`dsh plugin --profile <name> remove <pkg>` 或在 UI 卸载，然后检查 `profiles/<name>/node_modules/` 下无残留 junction 和 `*_tmp_*` 目录（junction 要用 `cmd /c rmdir <name>` 删除，**禁止 `rm -rf`**——Git Bash 的 rm 会穿透 junction 删目标内容）；
2. 再执行新来源安装：`dsh plugin --profile <name> add github:<owner>/<repo>`；
3. 插件管理器日志在 `profiles/<name>/.plugin-manager/logs/`：`operation-*/pnpm.log` 是 pnpm 输出，`github-connection-*/git.log` 是 `git ls-remote` 预检（空文件 = 仓库可达）。
**教训**：Windows 上凡是涉及 junction/符号链接的删除操作，先确认工具是否穿透链接；复现类实验**绝不**把 junction 指向有价值的目录（本次实验险些丢失工作副本的 git 历史，靠部署副本克隆恢复）。
