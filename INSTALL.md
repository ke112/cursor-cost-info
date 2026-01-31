# 安装和使用指南

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Cookie

创建配置文件并添加你的 Cursor Cookie：

```bash
# 创建配置目录（如果不存在）
mkdir -p ~/.config

# 创建配置文件
touch ~/.config/cursor_cookie
```

然后编辑 `~/.config/cursor_cookie` 文件，将你的 Cookie 粘贴进去。

#### 如何获取 Cookie？

1. 在浏览器中访问 https://cursor.com/cn/dashboard?tab=usage
2. 登录你的 Cursor 账号
3. 打开浏览器开发者工具（按 F12）
4. 切换到 **Network（网络）** 标签
5. 刷新页面
6. 找到 `usage-summary` 请求
7. 查看请求头（Request Headers）
8. 找到 `Cookie:` 字段
9. 复制完整的 Cookie 值（从 `Cookie:` 后面开始的所有内容）
10. 粘贴到 `~/.config/cursor_cookie` 文件中

**示例格式：**
```
WorkosCursorSessionToken=...; _ga=...; _gid=...
```

### 3. 编译和运行

```bash
# 编译
npm run compile

# 在开发模式下运行（会打开一个新的 VS Code 窗口）
# 在 VS Code 中按 F5
```

### 4. 打包安装

```bash
# 安装打包工具
npm install -g vsce

# 打包扩展
npm run package

# 这会生成一个 .vsix 文件
# 然后在 VS Code 中：
# 1. 打开扩展视图（Cmd+Shift+X 或 Ctrl+Shift+X）
# 2. 点击右上角的 "..." 菜单
# 3. 选择 "从 VSIX 安装..."
# 4. 选择生成的 .vsix 文件
```

## 验证安装

安装成功后，你应该能在状态栏左侧看到 Cursor 额度信息。

如果显示 "未配置 Cookie" 或 "获取失败"，请检查：
1. `~/.config/cursor_cookie` 文件是否存在
2. 文件中的 Cookie 是否正确
3. Cookie 是否已过期（需要重新获取）

## 故障排除

### 编译错误

如果遇到 TypeScript 编译错误，请确保：
1. 已安装所有依赖：`npm install`
2. Node.js 版本 >= 16.0.0

### Cookie 过期

Cursor 的 Cookie 会定期过期。如果遇到认证失败：
1. 重新访问 Cursor 网站并登录
2. 获取新的 Cookie
3. 更新 `~/.config/cursor_cookie` 文件

### 查看详细错误

在 VS Code 中：
1. Help > Toggle Developer Tools
2. 查看 Console 标签中的错误信息

## 开发

### 监听文件变化

```bash
npm run watch
```

### 调试

1. 在 VS Code 中打开项目
2. 按 F5 启动调试
3. 会打开一个新的 Extension Development Host 窗口
4. 在新窗口中测试扩展功能

### 代码结构

```
src/
├── extension.ts   # 主入口文件
├── api.ts         # API 调用逻辑
└── config.ts      # 配置文件读取
```

## 更新

当 Cookie 过期或需要更新时，只需要：

```bash
# 重新获取 Cookie 并更新文件
echo "新的Cookie值" > ~/.config/cursor_cookie

# 然后点击状态栏刷新，或执行刷新命令
```

## 卸载

如果要卸载扩展：
1. 在 VS Code 扩展视图中找到 "Cursor 额度信息"
2. 点击 "卸载"
3. （可选）删除配置文件：`rm ~/.config/cursor_cookie`

