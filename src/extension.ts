import * as vscode from 'vscode';
import { calculateTotalUsage, fetchUsageEvents, fetchUsageSummaryAuto, formatCurrency, formatModelName, formatTimestamp, formatTokenCount, formatUsageDisplay, getUsageColor, UsageEvent, UsageSummary } from './api';
import { getConfigHelpText, resolveAuth } from './config';

/** 刷新间隔（毫秒） */
const REFRESH_INTERVAL = 60000;

/** 通知阈值百分比列表 */
const NOTIFICATION_THRESHOLDS = [80, 85, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;
let currentSummary: UsageSummary | undefined;
let lastNotificationPercentage: number | null = null;
let currentUsageEvents: UsageEvent[] = [];

/**
 * 扩展激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Cursor 额度信息扩展已激活');

  // 创建状态栏项
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'cursor.costInfo.showDetails';
  statusBarItem.tooltip = '点击在浏览器中打开 Cursor 额度详情';
  context.subscriptions.push(statusBarItem);

  // 注册显示详情命令
  const showDetailsCommand = vscode.commands.registerCommand(
    'cursor.costInfo.showDetails',
    async () => {
      const url = vscode.Uri.parse('https://cursor.com/cn/dashboard?tab=usage');
      await vscode.env.openExternal(url);
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
  refreshTimer = setInterval(() => {
    updateUsageInfo();
  }, REFRESH_INTERVAL);

  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    }
  });
}

/**
 * 扩展停用时调用
 */
export function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
}

/**
 * 更新使用情况信息
 */
async function updateUsageInfo() {
  try {
    statusBarItem.text = '$(sync~spin) 加载中...';
    statusBarItem.show();

    const auth = await resolveAuth();

    if (!auth) {
      statusBarItem.text = '$(warning) Cursor: 未找到认证信息';
      statusBarItem.tooltip = getConfigHelpText();
      statusBarItem.color = undefined;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();

      vscode.window.showWarningMessage(
        '未找到 Cursor 认证信息，请确保已登录 Cursor'
      );
      return;
    }

    const summary = await fetchUsageSummaryAuto(auth);

    // 获取使用事件
    try {
      const usageEventsResponse = await fetchUsageEvents(
        auth,
        summary.billingCycleStart,
        summary.billingCycleEnd,
        10
      );
      if (usageEventsResponse && usageEventsResponse.usageEventsDisplay) {
        currentUsageEvents = usageEventsResponse.usageEventsDisplay;
      }
    } catch (err) {
      console.error('获取使用事件失败:', err);
    }

    currentSummary = summary;

    const total = calculateTotalUsage(summary, null);

    const displayText = formatUsageDisplay(summary, null, true, summary.isUnlimited);
    statusBarItem.text = displayText;

    if (summary.isUnlimited) {
      statusBarItem.color = getUsageColor(0);
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.color = getUsageColor(total.percentage);
      if (total.percentage >= 90) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (total.percentage >= 80) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        statusBarItem.backgroundColor = undefined;
      }
    }

    statusBarItem.command = 'cursor.costInfo.showDetails';
    statusBarItem.tooltip = getDetailedTooltip(summary);
    statusBarItem.show();

    checkAndSendNotification(total.percentage, total.totalUsed, total.totalLimit);

  } catch (error) {
    console.error('更新使用情况失败:', error);

    statusBarItem.text = '$(error) Cursor: 获取失败';
    statusBarItem.tooltip = `错误: ${error instanceof Error ? error.message : '未知错误'}\n\n💡 点击重试`;
    statusBarItem.command = 'cursor.costInfo.refresh';
    statusBarItem.color = '#F48771';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.show();

    vscode.window.showErrorMessage(
      `获取 Cursor 额度信息失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}

/**
 * 生成详细的工具提示信息
 */
function getDetailedTooltip(summary: UsageSummary): string {
  const total = calculateTotalUsage(summary, null);
  const planUsed = total.planUsed;
  const teamOnDemand = summary.teamUsage?.onDemand ?? { used: 0, limit: null, remaining: null };

  let lines: string[] = [];

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
    lines = [
      '=== Cursor 使用情况 ===',
      '',
      `总计: ${formatCurrency(total.totalUsed)} / ${formatCurrency(total.totalLimit)} (${total.percentage}%)`,
      '',
      `个人已用: ${formatCurrency(planUsed)}`,
      `团队已用: ${formatCurrency(teamOnDemand.used)}`
    ];
  }

  if (currentUsageEvents && currentUsageEvents.length > 0) {
    lines.push('');
    lines.push('--- 最近使用记录 ---');
    lines.push('时间                   |  Token      |  花费       |  模型');
    lines.push('─'.repeat(30));

    for (const event of currentUsageEvents) {
      const time = formatTimestamp(event.timestamp);
      const model = formatModelName(event.model).padEnd(30);
      const totalTokens = (event.tokenUsage.inputTokens || 0) + (event.tokenUsage.outputTokens || 0);
      const tokens = formatTokenCount(totalTokens).padStart(7);
      const cost = `$${(event.tokenUsage.totalCents / 100).toFixed(2)}`;
      lines.push(`${time}      | ${tokens}      | ${cost}      | ${model}`);
    }
  }

  lines.push('');
  lines.push('💡 点击在浏览器中打开完整详情');

  return lines.join('\n');
}

/**
 * 检查并发送通知
 */
function checkAndSendNotification(percentage: number, totalUsed: number, totalLimit: number) {
  let highestThreshold: number | null = null;

  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (percentage >= threshold && (lastNotificationPercentage === null || lastNotificationPercentage < threshold)) {
      if (highestThreshold === null || threshold > highestThreshold) {
        highestThreshold = threshold;
      }
    }
  }

  if (highestThreshold !== null) {
    sendNotification(percentage, totalUsed, totalLimit);
    lastNotificationPercentage = percentage;
  }
}

/**
 * 发送通知
 */
function sendNotification(percentage: number, totalUsed: number, totalLimit: number) {
  const usedStr = formatCurrency(totalUsed);
  const limitStr = formatCurrency(totalLimit);
  const remainingStr = formatCurrency(totalLimit - totalUsed);

  let message: string;

  if (percentage >= 95) {
    message = `⚠️ 警告：Cursor 使用率已达到 ${percentage}%！已用: ${usedStr} / 限额: ${limitStr} 剩余: ${remainingStr} 请及时关注！`;
    vscode.window.showErrorMessage(message);
  } else if (percentage >= 90) {
    message = `⚠️ 警告：Cursor 使用率已达到 ${percentage}%！已用: ${usedStr} / 限额: ${limitStr} 剩余: ${remainingStr}`;
    vscode.window.showErrorMessage(message);
  } else if (percentage >= 80) {
    message = `📊 Cursor 使用率已达到 ${percentage}% 已用: ${usedStr} / 限额: ${limitStr} 剩余: ${remainingStr}`;
    vscode.window.showWarningMessage(message);
  } else {
    message = `Cursor 使用率已达到 ${percentage}%！已用: ${usedStr} / 限额: ${limitStr} 剩余: ${remainingStr}`;
    vscode.window.showInformationMessage(message);
  }
}
