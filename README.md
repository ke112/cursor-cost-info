# Cursor Cost Info

一个 VS Code / Cursor 扩展，用于在状态栏实时显示 Cursor API 使用额度信息。**零配置**，自动读取 Cursor 登录凭据，开箱即用。

## 功能特性

- **零配置自动认证**：自动从 Cursor 本地 SQLite 数据库读取 accessToken，无需手动配置 Cookie
- **备用浏览器 Cookie 认证**：当本地 Token 不可用时，自动从浏览器读取 cursor.com 的 Cookie
- **状态栏实时显示**：在状态栏左侧显示使用额度信息（美元格式）
- **彩色小球指示器**：🟢🟡🟠🔴 直观展示使用率等级
- **无限额套餐支持**：自动识别无限额订阅，仅显示已用金额
- **计费周期倒计时**：悬浮提示中显示距离周期重置的剩余时间
- **套餐用量占比**：展示来自 API 的套餐用量百分比
- **On-Demand 分级预警**：🔴 超额红色警告 / 🟡 不足 20% 黄色预警 / 🟢 正常绿色显示
- **团队用量支持**：展示个人用量与团队 On-Demand 用量
- **最近使用记录**：悬浮提示中显示最近 10 条使用事件（时间、类型、模型、Token、花费）
- **窗口焦点管理**：窗口失焦时自动暂停轮询，聚焦时立即刷新并恢复轮询
- **自动重载机制**：支持外部脚本触发窗口自动重载（用于插件热更新）
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

- **计费周期倒计时**：📅 显示距离周期重置的剩余时间（X天X小时X分钟）
- **本周期已用**：💰 总已用金额、总限额、使用百分比
- **套餐用量占比**：📊 来自 API 的套餐用量百分比
- **On-Demand 用量**（启用时）：
  - 🔴 **超额警告**：已超出公司限额（$20.00），红色醒目提示
  - 🟡 **预警提示**：剩余免费额度不足 20%，黄色预警
  - 🟢 **正常显示**：显示已用金额及剩余免费额度
- **团队 On-Demand**：👥 团队按需用量（大于 0 时显示）
- **最近使用记录**（最近 10 条）：
  - 时间（MM-DD HH:mm）
  - 类型（On-Demand / Included）
  - 模型名称（最长 25 字符，超出截断）
  - Token 用量（自动简化：万/亿）
  - 花费（美元）

### 点击状态栏

点击状态栏上的额度信息，会直接在浏览器中打开 [Cursor Dashboard](https://cursor.com/cn/dashboard?tab=usage)，方便查看完整的使用详情。

### 刷新数据

**自动刷新：** 插件默认每 30 秒自动刷新一次额度信息。

**窗口焦点管理：** 当窗口失去焦点时自动暂停轮询，重新聚焦时立即刷新并恢复定时轮询，节省资源。

**手动刷新：**

- 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
- 输入 `Refresh Cursor Cost Info`
- 回车执行

### 自动重载机制

插件支持通过外部脚本触发窗口自动重载，用于插件热更新场景：

- 监听文件：`~/.cursor-cost-info/.reload-trigger`
- 工作原理：外部脚本（如打包脚本）`touch` 该文件后，插件检测到 `mtime` 变化，自动执行 `Reload Window`
- 轮询间隔：2 秒
- 优势：不依赖键盘模拟、不依赖 URI Scheme、不受窗口焦点/输入法影响

## API 接口

插件根据认证方式自动选择对应的 API 端点：

| 认证方式 | API 端点 | 方法 | 用途 |
|---------|---------|------|------|
| Token   | `https://api2.cursor.sh/auth/usage-summary` | GET | 获取使用摘要 |
| Cookie  | `https://cursor.com/api/usage-summary` | GET | 获取使用摘要 |
| Token/Cookie | `https://cursor.com/api/dashboard/get-filtered-usage-events` | POST | 获取使用事件列表 |

> **注意**：使用事件列表接口支持 Token 和 Cookie 两种方式调用。当使用 Token 认证时，插件会自动从 Token 中提取 user_id 构造 Cookie 来调用该接口。

## 数据说明

插件显示的数据来自 Cursor 官方 API，包括：

- **总使用金额**：计划使用（plan breakdown total）+ 按需使用（onDemand.used），单位：美分（显示时自动转换为美元）
- **总限额**：计划限额（plan.limit）+ 按需限额（onDemand.limit），单位：美分
- **剩余金额**：总限额 - 总使用金额
- **使用百分比**：(总使用金额 / 总限额) x 100%
- **On-Demand 限额**：公司免费额度 $20.00（2000 美分），超出部分自费
- **团队用量**：团队 onDemand 使用情况
- **使用事件**：包含时间戳、模型、类型（On-Demand/Included）、Token 用量（input/output/cacheWrite/cacheRead）、花费等详细信息

## 故障排除

### 显示"未找到认证信息"

- 确保已登录 Cursor IDE
- 确保系统已安装 `sqlite3` 命令行工具（用于读取本地数据库）
- 检查 Cursor 的 `state.vscdb` 文件是否存在（参见上方路径表）

### 显示"获取失败"

- 检查网络连接是否正常
- Token 可能已过期，重新登录 Cursor 即可自动刷新
- 点击状态栏可立即重试
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
├── extension.ts    # 扩展入口，状态栏管理、悬浮提示、定时刷新、窗口焦点管理、自动重载
├── api.ts          # API 调用、数据类型定义、格式化工具函数（金额/Token/时间）
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
