import * as vscode from 'vscode';
import { resolveAuth, getConfigHelpText } from './config';
import { fetchUsageSummaryAuto, fetchUsageEvents, formatUsageDisplay, UsageSummary, UsageEvent, calculateTotalUsage, formatCurrency, getUsageColor, formatTimestamp, formatModelName, formatTokenCount } from './api';

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;
let webViewPanel: vscode.WebviewPanel | undefined;
let currentSummary: UsageSummary | undefined;
let currentCustomOnDemandLimit: number | null = null;
let lastNotificationPercentage: number | null = null; // 记录上次发送通知的百分比
let isLoadFailed: boolean = false; // 追踪是否获取失败
let currentUsageEvents: UsageEvent[] = []; // 存储最近的使用事件

/**
 * 扩展激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Cursor 额度信息扩展已激活');

  // 创建状态栏项
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100 // 优先级，数字越大越靠左
  );
  statusBarItem.command = 'cursor.costInfo.showDetails';
  statusBarItem.tooltip = '点击在浏览器中打开 Cursor 额度详情';
  context.subscriptions.push(statusBarItem);

  // 注册显示详情命令
  const showDetailsCommand = vscode.commands.registerCommand(
    'cursor.costInfo.showDetails',
    async () => {
      await showDetailsPanel(context);
    }
  );
  context.subscriptions.push(showDetailsCommand);

  // 注册刷新命令
  const refreshCommand = vscode.commands.registerCommand(
    'cursor.costInfo.refresh',
    async () => {
      await updateUsageInfo();
    }
  );
  context.subscriptions.push(refreshCommand);

  // 初始加载
  updateUsageInfo();

  // 设置自动刷新
  setupAutoRefresh(context);

  // 检查是否需要显示 WebView
  checkAndShowWebView(context);

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorCostInfo.refreshInterval')) {
        // 重新设置自动刷新
        setupAutoRefresh(context);
      }
      if (e.affectsConfiguration('cursorCostInfo.onDemandLimit') ||
        e.affectsConfiguration('cursorCostInfo.showProgressBar') ||
        e.affectsConfiguration('cursorCostInfo.cookie')) {
        // 配置变化时刷新显示
        updateUsageInfo();
      }
      if (e.affectsConfiguration('cursorCostInfo.showWebView')) {
        // WebView 显示配置变化
        checkAndShowWebView(context);
      }
      if (e.affectsConfiguration('cursorCostInfo.enableNotifications') ||
        e.affectsConfiguration('cursorCostInfo.notificationThresholds')) {
        // 通知配置变化时，重置上次通知百分比（允许重新触发通知）
        lastNotificationPercentage = null;
      }
    })
  );
}

/**
 * 扩展停用时调用
 */
export function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (webViewPanel) {
    webViewPanel.dispose();
  }
}

/**
 * 设置自动刷新
 */
function setupAutoRefresh(context: vscode.ExtensionContext) {
  // 清除现有定时器
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  // 获取刷新间隔配置
  const config = vscode.workspace.getConfiguration('cursorCostInfo');
  const refreshInterval = config.get<number>('refreshInterval', 60000); // 默认 1 分钟

  // 设置新的定时器
  refreshTimer = setInterval(() => {
    updateUsageInfo();
  }, refreshInterval);

  // 确保定时器在扩展停用时被清除
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    }
  });
}

/**
 * 更新使用情况信息
 */
async function updateUsageInfo() {
  try {
    // 显示加载状态
    statusBarItem.text = '$(sync~spin) 加载中...';
    statusBarItem.show();

    // 解析认证信息（自动登录 Token > 手动 Cookie > 浏览器 Cookie）
    const auth = await resolveAuth();

    if (!auth) {
      statusBarItem.text = '$(warning) Cursor: 未找到认证信息';
      statusBarItem.tooltip = getConfigHelpText();
      statusBarItem.color = undefined;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();

      updateWebView(null, null);

      vscode.window.showWarningMessage(
        '未找到 Cursor 认证信息，请确保已登录 Cursor，或手动配置 Cookie',
        '打开设置'
      ).then((selection) => {
        if (selection === '打开设置') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'cursorCostInfo.cookie');
        }
      });
      return;
    }

    // 根据认证类型自动选择 API 端点
    const summary = await fetchUsageSummaryAuto(auth);

    // 获取使用事件（仅 Cookie 认证时支持）
    if (auth.type === 'cookie') {
      try {
        const usageEventsResponse = await fetchUsageEvents(auth.value, 10);
        if (usageEventsResponse && usageEventsResponse.usageEventsDisplay) {
          currentUsageEvents = usageEventsResponse.usageEventsDisplay;
        }
      } catch (err) {
        console.error('获取使用事件失败:', err);
      }
    }

    // 获取配置
    const config = vscode.workspace.getConfiguration('cursorCostInfo');
    const customOnDemandLimit = config.get<number | null>('onDemandLimit', null);
    const showProgressBar = config.get<boolean>('showProgressBar', true);

    // 保存当前数据
    currentSummary = summary;
    currentCustomOnDemandLimit = customOnDemandLimit;

    // 计算总使用情况
    const total = calculateTotalUsage(summary, customOnDemandLimit);

    // 更新状态栏显示（传入 isUnlimited 参数）
    const displayText = formatUsageDisplay(summary, customOnDemandLimit, showProgressBar, summary.isUnlimited);
    statusBarItem.text = displayText;

    // 设置颜色（无限额时使用默认绿色）
    if (summary.isUnlimited) {
      statusBarItem.color = getUsageColor(0);
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.color = getUsageColor(total.percentage);
      // 设置背景色（高使用率时显示警告/错误背景）
      if (total.percentage >= 90) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (total.percentage >= 80) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        statusBarItem.backgroundColor = undefined;
      }
    }

    // 成功获取：设置状态和命令
    isLoadFailed = false;
    statusBarItem.command = 'cursor.costInfo.showDetails';
    statusBarItem.tooltip = getDetailedTooltip(summary, customOnDemandLimit);
    statusBarItem.show();

    // 更新 WebView
    updateWebView(summary, customOnDemandLimit);

    // 检查并发送通知
    //checkAndSendNotification(total.percentage, total.totalUsed, total.totalLimit);

  } catch (error) {
    console.error('更新使用情况失败:', error);

    // 失败：设置状态和命令（点击时触发刷新而非打开浏览器）
    isLoadFailed = true;
    statusBarItem.text = '$(error) Cursor: 获取失败';
    statusBarItem.tooltip = `错误: ${error instanceof Error ? error.message : '未知错误'}\n\n💡 点击重试`;
    statusBarItem.command = 'cursor.costInfo.refresh';
    statusBarItem.color = '#F48771';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.show();

    updateWebView(null, null, error instanceof Error ? error.message : '未知错误');

    vscode.window.showErrorMessage(
      `获取 Cursor 额度信息失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}

/**
 * 显示详情面板（点击状态栏时调用）
 */
async function showDetailsPanel(context: vscode.ExtensionContext) {
  // 打开系统浏览器访问 Cursor 使用情况页面
  const url = vscode.Uri.parse('https://cursor.com/cn/dashboard?tab=usage');
  await vscode.env.openExternal(url);
}

/**
 * 检查并显示/隐藏 WebView
 */
function checkAndShowWebView(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('cursorCostInfo');
  const showWebView = config.get<boolean>('showWebView', false);

  if (showWebView) {
    if (!webViewPanel) {
      createWebViewPanel(context);
    }
  } else {
    if (webViewPanel) {
      webViewPanel.dispose();
      webViewPanel = undefined;
    }
  }
}

/**
 * 创建 WebView 面板
 */
function createWebViewPanel(context: vscode.ExtensionContext) {
  webViewPanel = vscode.window.createWebviewPanel(
    'cursorCostInfo',
    'Cursor 额度信息',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: []
    }
  );

  // 设置初始内容
  updateWebView(currentSummary, currentCustomOnDemandLimit);

  // 处理 WebView 关闭
  webViewPanel.onDidDispose(() => {
    webViewPanel = undefined;
  });

  // 处理消息（如果需要交互）
  webViewPanel.webview.onDidReceiveMessage(
    message => {
      switch (message.command) {
        case 'refresh':
          updateUsageInfo();
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'cursorCostInfo.cookie');
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * 更新 WebView 内容
 */
function updateWebView(summary: UsageSummary | null | undefined, customOnDemandLimit: number | null, error?: string) {
  if (!webViewPanel) {
    return;
  }

  // 检查 WebView 是否已被销毁
  try {
    // 尝试访问 webview 属性来检查是否仍然有效
    if (!webViewPanel.webview) {
      webViewPanel = undefined;
      return;
    }
  } catch (e) {
    // WebView 已被销毁，清理引用
    webViewPanel = undefined;
    return;
  }

  let html = '';

  if (error) {
    html = getErrorWebViewHtml(error);
  } else if (!summary) {
    html = getNoConfigWebViewHtml();
  } else {
    const total = calculateTotalUsage(summary, customOnDemandLimit);
    html = getUsageWebViewHtml(summary, total, customOnDemandLimit);
  }

  try {
    webViewPanel.webview.html = html;
  } catch (e) {
    // WebView 在设置内容时被销毁，清理引用
    console.warn('WebView 已被销毁，无法更新内容:', e);
    webViewPanel = undefined;
  }
}

/**
 * 生成使用情况的 WebView HTML
 */
function getUsageWebViewHtml(summary: UsageSummary, total: any, customOnDemandLimit: number | null): string {
  const plan = summary.individualUsage.plan;
  const teamOnDemand = summary.teamUsage?.onDemand ?? { used: 0, limit: null, remaining: null };
  const planUsed = typeof plan.breakdown?.total === 'number' ? plan.breakdown.total : plan.used;
  const teamRemaining = teamOnDemand.remaining !== null && teamOnDemand.remaining !== undefined
    ? teamOnDemand.remaining
    : (teamOnDemand.limit !== null && teamOnDemand.limit !== undefined ? teamOnDemand.limit - teamOnDemand.used : null);

  // 无限额套餐：使用绿色，不显示进度条
  const isUnlimited = summary.isUnlimited;
  const color = isUnlimited ? getUsageColor(0) : getUsageColor(total.percentage);
  const progressBar = '█'.repeat(Math.round((total.percentage / 100) * 20)) + '░'.repeat(20 - Math.round((total.percentage / 100) * 20));

  // 根据 isUnlimited 生成不同的摘要卡片内容
  const summaryCardContent = isUnlimited
    ? `
        <div class="summary-title">总计使用情况 (无限额)</div>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-label">已用</div>
                <div class="stat-value">${formatCurrency(total.totalUsed)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">限额</div>
                <div class="stat-value">无限</div>
            </div>
        </div>
    `
    : `
        <div class="summary-title">总计使用情况</div>
        <div class="progress-container">
            <div class="progress-bar">[${progressBar}] ${total.percentage}%</div>
        </div>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-label">已用</div>
                <div class="stat-value">${formatCurrency(total.totalUsed)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">限额</div>
                <div class="stat-value">${formatCurrency(total.totalLimit)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">剩余</div>
                <div class="stat-value">${formatCurrency(total.totalRemaining)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">使用率</div>
                <div class="stat-value">${total.percentage}%</div>
            </div>
        </div>
    `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor 额度信息</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .title {
            font-size: 18px;
            font-weight: bold;
        }
        .refresh-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 2px;
        }
        .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .summary-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .summary-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: ${color};
        }
        .progress-container {
            margin: 15px 0;
        }
        .progress-bar {
            font-family: monospace;
            font-size: 14px;
            color: ${color};
            margin: 10px 0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }
        .stat-value {
            font-size: 18px;
            font-weight: bold;
            color: ${color};
        }
        .section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .section-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            font-size: 13px;
        }
        .detail-label {
            color: var(--vscode-descriptionForeground);
        }
        .detail-value {
            font-weight: 500;
        }
        .error {
            color: var(--vscode-errorForeground);
            padding: 20px;
            text-align: center;
        }
        .warning {
            color: var(--vscode-textLink-foreground);
            padding: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">💰 Cursor 额度信息</div>
        <button class="refresh-btn" onclick="refresh()">🔄 刷新</button>
    </div>

    <div class="summary-card">
        ${summaryCardContent}
    </div>

    <div class="section">
        <div class="section-title">📋 计划使用 (Plan)</div>
        <div class="detail-row">
            <span class="detail-label">已用</span>
            <span class="detail-value">${formatCurrency((planUsed / 100.0))}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">限额</span>
            <span class="detail-value">${formatCurrency((plan.limit / 100.0))}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">剩余</span>
            <span class="detail-value">${formatCurrency((plan.remaining / 100.0))}</span>
        </div>
    </div>

    <div class="section">
        <div class="section-title">👥 团队使用 (Team)</div>
        <div class="detail-row">
            <span class="detail-label">已用</span>
            <span class="detail-value">${formatCurrency((teamOnDemand.used / 100.0))}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">限额</span>
            <span class="detail-value">${teamOnDemand.limit === null ? '不限' : formatCurrency((teamOnDemand.limit / 100.0))}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">剩余</span>
            <span class="detail-value">${teamRemaining === null ? '—' : formatCurrency((teamRemaining / 100.0))}</span>
        </div>
    </div>

    ${plan.autoSpend !== undefined || plan.apiSpend !== undefined ? `
    <div class="section">
        <div class="section-title">💸 花费明细</div>
        ${plan.autoSpend !== undefined ? `
        <div class="detail-row">
            <span class="detail-label">自动花费</span>
            <span class="detail-value">${formatCurrency((plan.autoSpend / 100.0))}</span>
        </div>` : ''}
        ${plan.apiSpend !== undefined ? `
        <div class="detail-row">
            <span class="detail-label">API 花费</span>
            <span class="detail-value">${formatCurrency((plan.apiSpend / 100.0))}</span>
        </div>` : ''}
    </div>` : ''}
    ${plan.autoPercentUsed !== undefined || plan.apiPercentUsed !== undefined ? `
    <div class="section">
        <div class="section-title">📊 使用率明细</div>
        ${plan.autoPercentUsed !== undefined ? `
        <div class="detail-row">
            <span class="detail-label">自动模型使用率</span>
            <span class="detail-value">${plan.autoPercentUsed.toFixed(1)}%</span>
        </div>` : ''}
        ${plan.apiPercentUsed !== undefined ? `
        <div class="detail-row">
            <span class="detail-label">API 使用率</span>
            <span class="detail-value">${plan.apiPercentUsed.toFixed(1)}%</span>
        </div>` : ''}
        ${plan.totalPercentUsed !== undefined ? `
        <div class="detail-row">
            <span class="detail-label">总使用率</span>
            <span class="detail-value">${plan.totalPercentUsed.toFixed(1)}%</span>
        </div>` : ''}
    </div>` : ''}

    <div class="section">
        <div class="section-title">📅 计费周期</div>
        <div class="detail-row">
            <span class="detail-label">开始</span>
            <span class="detail-value">${new Date(summary.billingCycleStart).toLocaleString('zh-CN')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">结束</span>
            <span class="detail-value">${new Date(summary.billingCycleEnd).toLocaleString('zh-CN')}</span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
}

/**
 * 生成无配置的 WebView HTML
 */
function getNoConfigWebViewHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor 额度信息</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .warning {
            text-align: center;
            padding: 40px 20px;
        }
        .warning-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .warning-text {
            font-size: 16px;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 20px;
        }
        .config-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 14px;
        }
        .config-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="warning">
        <div class="warning-icon">⚠️</div>
        <div class="warning-text">未找到 Cursor 认证信息</div>
        <p>请确保已登录 Cursor，或在设置中手动配置 <code>cursorCostInfo.cookie</code></p>
        <button class="config-btn" onclick="openSettings()">打开设置</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }
    </script>
</body>
</html>`;
}

/**
 * 生成错误的 WebView HTML
 */
function getErrorWebViewHtml(error: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor 额度信息</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .error {
            text-align: center;
            padding: 40px 20px;
        }
        .error-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .error-text {
            font-size: 16px;
            color: var(--vscode-errorForeground);
            margin-bottom: 20px;
        }
        .refresh-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 14px;
        }
        .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="error">
        <div class="error-icon">❌</div>
        <div class="error-text">获取失败</div>
        <p>${error}</p>
        <button class="refresh-btn" onclick="refresh()">重试</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
}

/**
 * 生成详细的工具提示信息
 */
function getDetailedTooltip(summary: UsageSummary, customOnDemandLimit: number | null = null): string {
  const total = calculateTotalUsage(summary, customOnDemandLimit);
  const planUsed = total.planUsed;
  const teamOnDemand = summary.teamUsage?.onDemand ?? { used: 0, limit: null, remaining: null };

  let lines: string[] = [];

  // 无限额套餐：只显示已用金额，不显示限额和百分比
  if (summary.isUnlimited) {
    lines = [
      '=== Cursor 使用情况 (无限额) ===',
      '',
      `总计已用: ${formatCurrency(total.totalUsed)}`,
      '',
      `个人已用: ${formatCurrency(planUsed)}`,
      `团队已用: ${formatCurrency(teamOnDemand.used)}`
    ];
  } else {
    // 有限额套餐：显示完整信息
    lines = [
      '=== Cursor 使用情况 ===',
      '',
      `总计: ${formatCurrency(total.totalUsed)} / ${formatCurrency(total.totalLimit)} (${total.percentage}%)`,
      '',
      `个人已用: ${formatCurrency(planUsed)}`,
      `团队已用: ${formatCurrency(teamOnDemand.used)}`
    ];
  }

  // 添加最近使用记录
  if (currentUsageEvents && currentUsageEvents.length > 0) {
    lines.push('');
    lines.push('--- 最近使用记录 ---');
    lines.push('时间       | 模型        | Token   | 花费');
    lines.push('─'.repeat(45));

    for (const event of currentUsageEvents) {
      const time = formatTimestamp(event.timestamp);
      const model = formatModelName(event.model).padEnd(11);
      const totalTokens = (event.tokenUsage.inputTokens || 0) + (event.tokenUsage.outputTokens || 0);
      const tokens = formatTokenCount(totalTokens).padStart(7);
      const cost = `$${(event.tokenUsage.totalCents / 100).toFixed(2)}`;
      lines.push(`${time} | ${model} | ${tokens} | ${cost}`);
    }
  }

  lines.push('');
  lines.push('💡 点击在浏览器中打开完整详情');

  return lines.join('\n');
}

/**
 * 检查并发送通知
 * @param percentage 当前使用百分比
 * @param totalUsed 总使用金额
 * @param totalLimit 总限额
 */
function checkAndSendNotification(percentage: number, totalUsed: number, totalLimit: number) {
  const config = vscode.workspace.getConfiguration('cursorCostInfo');
  const enableNotifications = config.get<boolean>('enableNotifications', true);
  
  if (!enableNotifications) {
    return;
  }

  const thresholds = config.get<number[]>('notificationThresholds', [80, 85, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
  
  // 找到当前百分比达到的最高阈值
  // 需要确保：1. 当前百分比 >= 阈值 2. 上次通知的百分比 < 阈值（避免重复通知）
  let highestThreshold: number | null = null;
  
  for (const threshold of thresholds) {
    if (percentage >= threshold && (lastNotificationPercentage === null || lastNotificationPercentage < threshold)) {
      if (highestThreshold === null || threshold > highestThreshold) {
        highestThreshold = threshold;
      }
    }
  }
  
  // 如果找到了需要通知的阈值，发送通知
  if (highestThreshold !== null) {
    sendNotification(percentage, highestThreshold, totalUsed, totalLimit);
    lastNotificationPercentage = percentage;
  }
}

/**
 * 发送通知
 * @param percentage 当前使用百分比
 * @param threshold 触发的阈值
 * @param totalUsed 总使用金额
 * @param totalLimit 总限额
 */
function sendNotification(percentage: number, threshold: number, totalUsed: number, totalLimit: number) {
  const usedStr = formatCurrency(totalUsed);
  const limitStr = formatCurrency(totalLimit);
  const remainingStr = formatCurrency(totalLimit - totalUsed);
  
  let message = `Cursor 使用率已达到 ${percentage}%！\n已用: ${usedStr} / 限额: ${limitStr}\n剩余: ${remainingStr}`;
  
  let severity: 'info' | 'warning' | 'error' = 'info';
  if (percentage >= 95) {
    severity = 'error';
    message = `⚠️ 警告：Cursor 使用率已达到 ${percentage}%！\n已用: ${usedStr} / 限额: ${limitStr}\n剩余: ${remainingStr}\n请及时关注使用情况！`;
  } else if (percentage >= 90) {
    severity = 'error';
    message = `⚠️ 警告：Cursor 使用率已达到 ${percentage}%！\n已用: ${usedStr} / 限额: ${limitStr}\n剩余: ${remainingStr}`;
  } else if (percentage >= 80) {
    severity = 'warning';
    message = `📊 Cursor 使用率已达到 ${percentage}%\n已用: ${usedStr} / 限额: ${limitStr}\n剩余: ${remainingStr}`;
  }

  if (severity === 'error') {
    vscode.window.showErrorMessage(message, '查看详情').then(selection => {
      if (selection === '查看详情') {
        // 可以打开 WebView 或跳转到设置
        const config = vscode.workspace.getConfiguration('cursorCostInfo');
        const showWebView = config.get<boolean>('showWebView', false);
        if (!showWebView) {
          vscode.window.showInformationMessage('可以在设置中启用 cursorCostInfo.showWebView 查看详细信息');
        }
      }
    });
  } else if (severity === 'warning') {
    vscode.window.showWarningMessage(message, '查看详情').then(selection => {
      if (selection === '查看详情') {
        const config = vscode.workspace.getConfiguration('cursorCostInfo');
        const showWebView = config.get<boolean>('showWebView', false);
        if (!showWebView) {
          vscode.window.showInformationMessage('可以在设置中启用 cursorCostInfo.showWebView 查看详细信息');
        }
      }
    });
  } else {
    vscode.window.showInformationMessage(message);
  }
}

