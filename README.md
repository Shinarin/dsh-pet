# dsh-pet

DSH 桌宠插件 —— 兼容 Web UI 和桌面版。

## 功能

- 实时跟随 DSH 会话状态（思考中 / 编辑中 / 空闲中）
- 在 DSH 界面右下角显示浮动宠物 GIF
- 支持拖动位置、单击摸头、双击互动
- 自定义各状态 GIF（透明底最佳）
- 审批/完成提醒（弹跳 + 提示音）

## 安装

将本插件放入 DSH 插件目录：

```bash
# Desktop 版
cp -r dsh-pet ~/.dsh/plugins/

# 然后在 DSH 设置 → 插件 中启用，或手动编辑 patch
```

## 配置

在 DSH 设置面板的「桌宠设置」中可调整：

| 选项 | 说明 |
|------|------|
| 大小 | 50%–250% |
| 双击 | 摸头冒爱心 |
| 审批提醒 | 有待审核时弹跳 + 可选提示音 |
| 完成提醒 | 忙碌超1分钟后回到空闲时弹跳 + 三音提示 |
| 自定义 GIF | 为各状态分别上传 GIF |

## 文件结构

```
dsh-pet/
  package.json          # 插件元数据
  cordis.patch.yml      # Cordis 层配置
  lib/
    index.js            # 服务端入口（HTTP API + GIF 服务）
  client.js             # 客户端入口（浮动宠物 UI + 设置面板）
  default-gifs/         # 内置默认 GIF
    idle.gif
    thinking.gif
    answering.gif
    approval.gif
```

## 原理

- 客户端通过 DOM MutationObserver 监测 DSH 界面状态（停止按钮、loading spinner、输入框禁用等）
- 服务端提供静态 GIF 文件服务和配置持久化
- 客户端在固定定位的浮层中显示对应状态的 GIF

## License

MIT
