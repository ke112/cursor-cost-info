# 项目结构说明

## 目录结构

```
cursor_cost_info/
│
├── src/                          # 源代码目录
│   ├── extension.ts              # 主入口文件，扩展激活和状态栏管理
│   ├── api.ts                    # API 调用，获取使用情况数据
│   └── config.ts                 # 配置文件读取，管理 Cookie
│
├── .vscode/                      # VS Code 调试配置
│   ├── launch.json               # 调试启动配置
│   └── tasks.json                # 构建任务配置
│
├── out/                          # 编译输出目录（运行 npm run compile 后生成）
│   ├── extension.js
│   ├── api.js
│   └── config.js
│
├── node_modules/                 # npm 依赖（运行 npm install 后生成）
│
├── package.json                  # 扩展清单和依赖配置
├── tsconfig.json                 # TypeScript 编译配置
├── .eslintrc.json                # ESLint 代码检查配置
├── .vscodeignore                 # 打包时忽略的文件
├── .gitignore                    # Git 忽略的文件
│
├── README.md                     # 主文档，功能说明和使用指南
├── INSTALL.md                    # 详细安装步骤和故障排除
├── QUICK_START.md                # 快速开始指南
├── PROJECT_STRUCTURE.md          # 本文件，项目结构说明
│
└── setup.sh                      # 自动安装脚本
```

## 核心文件说明

### 源代码 (src/)

#### extension.ts
主扩展文件，负责：
- 扩展的激活和停用
- 状态栏项的创建和管理
- 刷新命令的注册
- 自动刷新定时器
- 错误处理和用户提示

**主要函数：**
- `activate()` - 扩展激活入口
- `deactivate()` - 扩展停用清理
- `updateUsageInfo()` - 更新使用情况
- `setupAutoRefresh()` - 设置自动刷新
- `getDetailedTooltip()` - 生成详细提示

#### api.ts
API 调用模块，负责：
- 与 Cursor API 通信
- 处理 HTTPS 请求和响应
- 数据解析和类型定义
- 格式化显示文本

**主要函数：**
- `fetchUsageSummary(cookie)` - 获取使用情况
- `formatUsageDisplay(summary)` - 格式化显示文本
- `getShortUsageText(summary)` - 获取简短文本

**类型定义：**
- `UsageSummary` - API 响应数据结构

#### config.ts
配置管理模块，负责：
- 读取本地配置文件
- 验证 Cookie 格式
- 提供配置路径

**主要函数：**
- `getConfigPath()` - 获取配置文件路径
- `readCursorCookie()` - 读取 Cookie
- `validateCookie(cookie)` - 验证 Cookie

### 配置文件

#### package.json
扩展清单文件，包含：
- 扩展的基本信息（名称、版本、描述）
- 激活事件（onStartupFinished）
- 贡献的命令（刷新命令）
- 配置项（刷新间隔）
- 依赖包
- 构建脚本

#### tsconfig.json
TypeScript 编译配置：
- 编译目标：ES2020
- 模块系统：CommonJS
- 输出目录：out/
- 源目录：src/
- 严格模式启用

#### .eslintrc.json
代码检查配置：
- 使用 TypeScript ESLint
- 规则：禁用 explicit-any 警告

### 文档文件

#### README.md
主文档，包含：
- 功能特性
- 安装方法
- 配置步骤
- 使用指南
- 故障排除
- 隐私说明

#### INSTALL.md
详细安装指南，包含：
- 逐步安装说明
- Cookie 获取详细步骤
- 开发调试方法
- 代码结构说明
- 故障排除

#### QUICK_START.md
快速参考：
- 一键安装命令
- 快速配置步骤
- 常见问题解答

### 辅助文件

#### setup.sh
自动安装脚本：
- 检查环境（Node.js、npm）
- 安装依赖
- 检查配置文件
- 编译项目
- 提供下一步指导

## 数据流

```
用户启动 VS Code
    ↓
扩展激活 (extension.ts:activate)
    ↓
创建状态栏项
    ↓
读取配置 (config.ts:readCursorCookie)
    ↓
调用 API (api.ts:fetchUsageSummary)
    ↓
更新状态栏显示
    ↓
设置自动刷新定时器
    ↓
每 5 分钟重复 API 调用
```

## 外部依赖

### 运行时依赖
- `vscode` - VS Code 扩展 API

### 开发依赖
- `@types/node` - Node.js 类型定义
- `@types/vscode` - VS Code API 类型定义
- `typescript` - TypeScript 编译器
- `@typescript-eslint/*` - TypeScript ESLint
- `eslint` - 代码检查工具

### 外部配置
- `~/.config/cursor_cookie` - 用户的 Cursor Cookie（不在项目中）

## API 端点

```
URL: https://cursor.com/api/usage-summary
Method: GET
Headers:
  - User-Agent: Mozilla/5.0...
  - Cookie: (从配置文件读取)
  - Accept: */*
  - Referer: https://cursor.com/cn/dashboard?tab=usage
```

## 构建和发布

### 开发模式
```bash
npm run watch    # 监听文件变化并自动编译
F5              # 在 VS Code 中启动调试
```

### 生产构建
```bash
npm run compile  # 编译 TypeScript
npm run package  # 打包成 .vsix 文件
```

### 文件打包
使用 `.vscodeignore` 控制打包内容：
- 包含：`out/` 目录、`package.json`、`README.md`
- 排除：`src/` 目录、`node_modules/`、配置文件

## 扩展点

### 命令
- `cursor.costInfo.refresh` - 刷新额度信息

### 配置
- `cursorCostInfo.refreshInterval` - 刷新间隔（毫秒）

### 状态栏
- 位置：左侧
- 优先级：100
- 可点击：是
- 工具提示：是

## 许可和隐私

- 开源许可：MIT
- 数据存储：仅本地（~/.config/cursor_cookie）
- 网络请求：仅向 Cursor 官方 API
- 无第三方数据传输

