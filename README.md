# Cursor Cost Info

一个 VS Code / Cursor 扩展，用于在状态栏实时显示 Cursor API 使用额度信息。**零配置**，自动读取 Cursor 登录凭据，开箱即用。

## 功能特性

- **零配置自动认证**：自动从 Cursor 本地 SQLite 数据库读取 accessToken，无需手动配置 Cookie
- **备用浏览器 Cookie 认证**：当本地 Token 不可用时，自动从浏览器读取 cursor.com 的 Cookie
- **状态栏实时显示**：在状态栏左侧显示使用额度信息（美元格式）
- **彩色小球指示器**：🟢🟡🟠🔴 直观展示使用率等级
- **无限额套餐支持**：自动识别无限额订阅，仅显示已用金额
- **团队用量支持**：展示个人用量与团队用量
- **最近使用记录**：悬浮提示中显示最近 10 条使用事件（时间、Token、花费、模型）
- **智能通知系统**：达到配置阈值时自动提醒（每个阈值仅通知一次）
- **自动定时刷新**：默认每 30 秒自动刷新
- **快速查看详情**：点击状态栏直接在浏览器中打开 Cursor Dashboard
- **手动刷新命令**：通过命令面板手动触发刷新
- **跨平台支持**：支持 macOS、Linux、Windows

## 安装

### 从源码安装

1. 克隆或下载此项目
2. 在项目目录下运行：
   ```bash
   npm install
   npm run compile
   ```
3. 在 VS Code 中按 `F5` 调试运行，或打包安装：
   ```bash
   npm install -g vsce
   vsce package
   ```
4. 安装生成的 `.vsix` 文件

## 认证方式

插件采用**自动认证**，无需手动配置，按以下优先级依次尝试：

### 1. Cursor 本地 Token（推荐，零配置）

插件会自动从 Cursor IDE 本地 SQLite 数据库（`state.vscdb`）中读取 `accessToken`。只要你已登录 Cursor，插件即可直接工作。

数据库路径因操作系统而异：

| 操作系统 | 路径 |
|---------|------|
| macOS   | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Linux   | `~/.config/Cursor/User/globalStorage/state.vscdb` |
| Windows | `%APPDATA%/Cursor/User/globalStorage/state.vscdb` |

### 2. 浏览器 Cookie（备用方案）

当本地 Token 不可用时，插件会尝试从浏览器读取 cursor.com 的 Cookie（依赖 `@mherod/get-cookie` 包，支持 Chrome、Firefox、Safari 等）。

> **提示**：绝大多数情况下，只要你已登录 Cursor，插件会自动工作，无需任何配置。

## 使用方法

### 查看额度信息

插件激活后，状态栏左侧会显示额度信息：

**有限额套餐：**

```
🟡 65% | $1.03/$20.00
```

**无限额套餐：**

```
🟢 已用: $1.03
```

**显示说明：**

- 所有金额以美元格式显示（$XX.XX），原始数据以美分为单位，自动转换
- **已用金额** = 计划使用（plan breakdown total）+ 按需使用（onDemand.used）
- **总限额** = 计划限额（plan.limit）+ 按需限额（onDemand.limit）
- **百分比** = (已用金额 / 总限额) x 100%
- **颜色指示**：
  - 🟢 绿色（0-50%）：使用率低
  - 🟡 黄色（50-80%）：使用率中等
  - 🟠 橙色（80-90%）：使用率较高（警告背景）
  - 🔴 红色（90-100%）：使用率很高（错误背景）

### 悬浮提示详情

鼠标悬浮在状态栏项上，可以看到详细的使用统计信息：

- **总计使用情况**：总已用、总限额、使用百分比
- **个人已用 / 团队已用**：分别展示个人和团队维度的用量
- **最近使用记录**（最近 10 条）：
  - 时间（MM-DD HH:mm）
  - Token 用量（自动简化：K/M）
  - 花费（美元）
  - 模型名称（自动简化显示）

### 点击状态栏

点击状态栏上的额度信息，会直接在浏览器中打开 [Cursor Dashboard](https://cursor.com/cn/dashboard?tab=usage)，方便查看完整的使用详情。

### 刷新数据

**自动刷新：** 插件默认每 30 秒自动刷新一次额度信息。

**手动刷新：**

- 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
- 输入 `Refresh Cursor Cost Info`
- 回车执行

### 使用率通知

当使用率达到配置的阈值时，插件会自动发送通知提醒：

- **80-89%**：警告通知（黄色）
- **90-94%**：错误通知（红色）
- **95-100%**：严重错误通知（红色，带额外提示）

**通知特点：**

- 每个阈值只通知一次，避免重复提醒
- 默认通知阈值：`[80, 85, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100]`

例如：使用率从 79% 跳到 82% 时，会触发 80% 阈值通知；从 82% 跳到 87% 时，会触发 85% 阈值通知。

## API 接口

插件根据认证方式自动选择对应的 API 端点：

| 认证方式 | API 端点 | 用途 |
|---------|---------|------|
| Token   | `https://api2.cursor.sh/auth/usage-summary` | 获取使用摘要 |
| Cookie  | `https://cursor.com/api/usage-summary` | 获取使用摘要 |
| Cookie  | `https://cursor.com/api/dashboard/get-filtered-usage-events` | 获取使用事件列表 |

> **注意**：使用事件列表接口仅支持 Cookie 方式调用。当使用 Token 认证时，插件会自动从 Token 中提取 user_id 构造 Cookie 来调用该接口。

## 数据说明

插件显示的数据来自 Cursor 官方 API，包括：

- **总使用金额**：计划使用（plan breakdown total）+ 按需使用（onDemand.used），单位：美分（显示时自动转换为美元）
- **总限额**：计划限额（plan.limit）+ 按需限额（onDemand.limit），单位：美分
- **剩余金额**：总限额 - 总使用金额
- **使用百分比**：(总使用金额 / 总限额) x 100%
- **团队用量**：团队 onDemand 使用情况
- **使用事件**：包含时间戳、模型、Token 用量（input/output/cache）、花费等详细信息

## 故障排除

### 显示"未找到认证信息"

- 确保已登录 Cursor IDE
- 确保系统已安装 `sqlite3` 命令行工具（用于读取本地数据库）
- 检查 Cursor 的 `state.vscdb` 文件是否存在（参见上方路径表）

### 显示"获取失败"

- 检查网络连接是否正常
- Token 可能已过期，重新登录 Cursor 即可自动刷新
- 查看 VS Code 的开发者控制台（Help > Toggle Developer Tools）查看详细错误信息

### Token 过期

Cursor 的 accessToken 会定期过期。如果遇到认证失败（状态码 401），只需重新登录 Cursor IDE，插件会自动读取新的 Token。

## 命令列表

| 命令 | 说明 |
|------|------|
| `Show Cursor Cost Details` | 在浏览器中打开 Cursor Dashboard |
| `Refresh Cursor Cost Info` | 手动刷新额度信息 |

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听文件变化
npm run watch

# 打包
npm run package
```

## 项目结构

```
src/
├── extension.ts    # 扩展入口，状态栏管理、通知、定时刷新
├── api.ts          # API 调用、数据类型定义、格式化工具函数
├── auth.ts         # Token 读取、JWT 解析、user_id 提取
└── config.ts       # 认证解析（Token/Cookie 优先级）、浏览器 Cookie 读取
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

项目地址：[https://github.com/ke112/cursor-cost-info](https://github.com/ke112/cursor-cost-info)

## 隐私说明

- 本插件仅在本地读取 Cursor IDE 的登录信息（accessToken）
- 仅向 Cursor 官方 API 发送请求
- 不会收集、存储或传输任何用户数据到第三方
- Token 信息仅从本地数据库读取，不会上传到任何服务器
- 所有数据仅在本地处理和显示

## 免责声明

本插件为非官方工具，仅供个人使用。请遵守 Cursor 的服务条款。
