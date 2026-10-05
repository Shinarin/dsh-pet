# Spec: 桌宠浮层默认位置（overlay-position）

## 1. 产品规则

- DSH 桌面版打开后，若用户从未拖动过桌宠（localStorage 无 `dsh-pet:position`），
  桌宠默认锚定在窗口右下角：**距右边缘 100px（左移），距下边缘 200px（上移）**。
- 实现为 CSS 固定定位 `right: 100px; bottom: 200px`，以浮层容器自身的右下角对齐该锚点；
  缩放（scale）改变容器尺寸时锚点不变。
- 用户拖动后位置存入 localStorage，之后以拖动位置为准（现有逻辑不变）。

## 2. 状态所有者

- 默认位置：`createPetOverlay()`（client.js）中的内联样式，唯一写入点。
- 拖动位置：`PetController.setupDrag()` 读写 localStorage `dsh-pet:position`。

## 3. 接口

无对外接口；仅 `createPetOverlay()` 的初始 `container.style.cssText`。

## 4. 验收场景

1. 清除 localStorage 后重启 DSH → 桌宠出现在窗口右下角，右间距 100px、下间距 200px。
2. 调整设置面板大小（scale）→ 桌宠右下角锚点位置不变。
3. 拖动桌宠后重启 DSH → 出现在拖动后的位置，而非默认锚点。
