# Cursor Cost Info

VS Code / Cursor 扩展，在状态栏实时显示 Cursor API 使用额度。

## 快速开始

```bash
npm run compile    # 编译 TypeScript
npm run watch      # 监听模式编译
bash package.sh    # 打包 + 安装到所有编辑器（VSCode/Cursor/Trae）
```

## 项目结构

```
src/
├── extension.ts   # 入口：状态栏、命令注册、轮询、SQLite 文件监听
├── auth.ts        # 认证：SQLite 读取 token/email、JWT 解析
├── config.ts      # 认证解析优先级（SQLite > stored session > cookie）
└── api.ts         # API 调用：用量摘要、使用事件、格式化
```

## 核心机制

### 认证优先级（resolveAuth）

1. Cursor SQLite 数据库 `state.vscdb` 中的 `cursorAuth/accessToken`（权威来源）
2. 若 SQLite 数据库不存在（非 Cursor 环境），回退到 extension storage / browser cookie

### 登录/退出检测

- `fs.watchFile` 监听 `state.vscdb`（1s 间隔），文件变化时立即刷新状态
- 10s 定时轮询兜底
- 窗口获得焦点时立即刷新

### 登录触发

- 未登录时状态栏点击执行 `editor.cpp.login`（Cursor 原生登录命令）
- 登录后 Cursor 写入 SQLite → 文件监听触发 → 插件自动刷新

### 401 处理

- API 返回 401 直接切换到"请登录"状态（不显示"获取失败"）

## 部署

`package.sh` 一键完成：编译 → 打包 .vsix → 安装到 VSCode/Cursor/Trae → 触发自动重载

自动重载机制：`touch ~/.cursor-cost-info/.reload-trigger`，插件通过 `fs.watchFile` 检测到 mtime 变化后执行 `workbench.action.reloadWindow`。

## 注意事项

- SQLite 查询依赖系统 `sqlite3` 命令行工具
- Cursor 的 auth provider ID 是 `anysphere`
- JWT payload 中 email 字段可能是 `email`、`https://email` 或 `plain_email`
- 退出登录时 SQLite 数据库存在但 token 被清除，此时 resolveAuth 必须返回 null（不能用 cookie 兜底）
