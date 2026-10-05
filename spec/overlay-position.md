# Spec: 桌宠浮层默认位置（overlay-position）

## 1. 产品规则

- 桌宠始终**锚定窗口右下角**：定位统一使用「距右边缘 / 距下边缘的偏移量」，窗口
  resize、最大化、还原时桌宠跟随右下角移动，不停留在旧屏幕像素坐标。
- 默认偏移（从未拖动过）：距右边缘 **100px**，距下边缘 **200px**。
- 用户拖动后，将松手位置换算为右下角偏移量保存；之后以该偏移为准。
- 偏移量始终钳制在 `[0, 视口尺寸 − 桌宠尺寸]` 内，保证任何窗口尺寸下桌宠可见。
- 旧版本存储的绝对像素格式 `{x, y}` 在加载时自动迁移为右下角偏移并钳制。

## 2. 状态所有者

- 唯一位置状态：`PetController.position = { right, bottom }`（client.js）。
- 持久化：localStorage `dsh-pet:position`，格式 `{ right, bottom }`（像素），
  仅由 `PetController.savePosition()` 写入。
- 应用位置的唯一入口：`PetController.applyPosition()`（写 `style.right/bottom`，
  清 `left/top`）；拖动过程中允许临时 `left/top`，松手立即换算回归锚定。
- `createPetOverlay()` 的内联样式只提供初始默认值，与 `position` 默认值保持一致。

## 3. 接口

- `applyPosition(pos?: {right, bottom})` — 钳制后应用右下角偏移（缺省用 `this.position`）。
- `savePosition({right, bottom})` — 更新 `this.position` 并写 localStorage。
- `loadPosition()` — 读取 localStorage；识别并迁移旧 `{x, y}` 格式，否则返回 null。

## 4. 验收场景

1. 清除 localStorage 重启 DSH → 桌宠在窗口右下角（右 100px、下 200px）。
2. 重启后直接可见，无需拉动窗口。
3. 拖动桌宠到任意位置 → 最大化/还原/拉伸窗口 → 桌宠相对右下角的距离不变。
4. 小窗口下拖动过的桌宠，重启后窗口更小时仍完整可见（钳制在视口内）。
5. 旧 `{x, y}` 存档加载后不丢位置、不出现视口外隐藏。
