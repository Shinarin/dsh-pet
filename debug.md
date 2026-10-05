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
3. 或 `dsh plugin add C:/Users/da270/.dsh/plugins/dsh-pet` 本地路径安装
