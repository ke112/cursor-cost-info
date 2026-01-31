# 快速开始

## 一键安装

```bash
./setup.sh
```

## 手动安装

### 1. 安装依赖并编译

```bash
npm install
npm run compile
```

### 2. 配置 Cookie

```bash
# 创建配置文件
mkdir -p ~/.config
echo "你的Cookie值" > ~/.config/cursor_cookie
```

**获取 Cookie 的步骤：**
- 访问 https://cursor.com/cn/dashboard?tab=usage
- 登录并按 F12 打开开发者工具
- Network 标签 → 找到 `usage-summary` → Request Headers → 复制 Cookie

### 3. 运行扩展

在 VS Code 中：
- 打开此项目
- 按 `F5` 开始调试
- 新窗口状态栏左侧会显示额度信息

### 4. 打包安装（可选）

```bash
npm install -g vsce
npm run package
# 然后在 VS Code 中安装生成的 .vsix 文件
```

## 使用

- **查看额度**：状态栏左侧显示（格式：`Cursor: $103.00/$2,000.00 (5%) 剩余: $1,897.00`）
- **刷新数据**：点击状态栏项，或使用命令面板搜索"刷新 Cursor 额度信息"
- **详细信息**：鼠标悬浮在状态栏上查看完整统计（包括计划使用、按需使用、总计等）

## 配置

在 VS Code 设置中搜索 `Cursor Cost Info`：

- `cursorCostInfo.refreshInterval`: 自动刷新间隔（毫秒），默认 300000（5分钟）
- `cursorCostInfo.onDemandLimit`: 自定义按需使用限额（美元），默认 null（使用 API 返回的值）

**配置示例：**
```json
{
  "cursorCostInfo.refreshInterval": 300000,
  "cursorCostInfo.onDemandLimit": 1000  // 设置 onDemand 限额为 $1000
}
```

**说明：**
- 总使用量 = plan.used + onDemand.used
- 总限额 = plan.limit + onDemandLimit（如果设置了自定义值）
- 所有金额以美元格式显示（$XX.XX）

## 常见问题

### 显示"未配置 Cookie"
- 检查 `~/.config/cursor_cookie` 文件是否存在且不为空

### 显示"获取失败"
- Cookie 可能已过期，重新获取并更新配置文件
- 检查网络连接

### 如何更新 Cookie
```bash
echo "新的Cookie值" > ~/.config/cursor_cookie
```
然后点击状态栏刷新。

## 项目结构

```
cursor_cost_info/
├── src/
│   ├── extension.ts    # 主逻辑
│   ├── api.ts          # API 调用
│   └── config.ts       # 配置管理
├── package.json        # 扩展配置
├── tsconfig.json       # TypeScript 配置
├── README.md           # 完整文档
├── INSTALL.md          # 安装指南
└── setup.sh            # 自动安装脚本
```

## 完整文档

- [README.md](README.md) - 完整功能说明
- [INSTALL.md](INSTALL.md) - 详细安装指南

