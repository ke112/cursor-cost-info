import * as vscode from 'vscode';
import { calculateTotalUsage, fetchUsageEvents, fetchUsageSummaryAuto, formatCurrency, formatTimestamp, formatTokenCount, formatUsageDisplay, getUsageColor, USAGE_EVENT_KIND_USAGE_BASED, UsageEvent, UsageSummary } from './api';
import { getConfigHelpText, resolveAuth } from './config';

/** 刷新间隔（毫秒） */
const REFRESH_INTERVAL = 30000;

/** 通知阈值百分比列表 */
const NOTIFICATION_THRESHOLDS = [80, 85, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

/** 公司 On-Demand 限额（美分），超过此值员工自费 */
const COMPANY_ON_DEMAND_LIMIT_CENTS = 2000; // $20

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;
let currentSummary: UsageSummary | undefined;
let lastNotificationPercentage: number | null = null;
let currentUsageEvents: UsageEvent[] = [];
let isWindowFocused = true;

/**
 * 扩展激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Cursor 额度信息扩展已激活');

  // 创建状态栏项
  statusBarItem = vscode.window.createStatusBarItem(
    'cursorCostInfo',
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.name = 'Cursor Cost';
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

  // 监听窗口焦点变化：非活跃时停止轮询，活跃时恢复轮询
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused && !isWindowFocused) {
        isWindowFocused = true;
        updateUsageInfo(); // 恢复活跃时立即刷新一次
        startPolling();
      } else if (!e.focused && isWindowFocused) {
        isWindowFocused = false;
        stopPolling();
      }
    })
  );

  // 初始加载
  updateUsageInfo();

  // 设置自动刷新
  startPolling();

  context.subscriptions.push({
    dispose: () => {
      stopPolling();
    }
  });
}

/**
 * 启动定时轮询
 */
function startPolling() {
  stopPolling();
  refreshTimer = setInterval(() => {
    updateUsageInfo();
  }, REFRESH_INTERVAL);
}

/**
 * 停止定时轮询
 */
function stopPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

/**
 * 扩展停用时调用
 */
export function deactivate() {
  stopPolling();
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
      statusBarItem.command = 'cursor.costInfo.refresh';
      statusBarItem.color = undefined;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
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
    statusBarItem.tooltip = `错误: ${error instanceof Error ? error.message : '未知错误'}\n\n💡 点击立即重试`;
    statusBarItem.command = 'cursor.costInfo.refresh';
    statusBarItem.color = '#F48771';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.show();
    // 不弹出悬浮错误提示，仅在状态栏显示失败态，点击可重试
  }
}

/**
 * 计算距离周期重置的倒计时文本
 */
function formatCountdown(billingCycleEnd: string): string {
  const now = new Date();
  const end = new Date(billingCycleEnd);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) { return '已到期，等待重置'; }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const parts: string[] = [];
  if (days > 0) { parts.push(`${days}天`); }
  if (hours > 0) { parts.push(`${hours}小时`); }
  parts.push(`${minutes}分钟`);

  return parts.join('');
}

/**
 * 从显示消息中提取百分比数字
 */
function extractPercentage(message: string): string | null {
  const match = message.match(/(\d+)%/);
  return match ? match[1] : null;
}

/**
 * 生成详细的工具提示信息
 */
function getDetailedTooltip(summary: UsageSummary): vscode.MarkdownString {
  const plan = summary.individualUsage.plan;
  const onDemand = summary.individualUsage.onDemand;
  const teamOnDemand = summary.teamUsage?.onDemand ?? { used: 0, limit: null, remaining: null };
  const total = calculateTotalUsage(summary, null);

  // 个人本周期总用量 = plan.breakdown.total
  const individualTotalUsed = plan.breakdown.total;

  const lines: string[] = [];

  lines.push('**--- Cursor 使用情况 ---**');

  // ── 周期重置倒计时 ──
  const countdown = formatCountdown(summary.billingCycleEnd);
  lines.push(`📅 距离周期重置: ${countdown}`);

  // ── 本周期已用（合并后的唯一值）──
  if (summary.isUnlimited) {
    lines.push(`💰 本周期已用: ${formatCurrency(individualTotalUsed)}`);
  } else {
    lines.push(`💰 本周期已用: ${formatCurrency(individualTotalUsed)} / ${formatCurrency(total.totalLimit)} (${total.percentage}%)`);
  }

  // ── 套餐用量百分比（来自 API 的 displayMessage）──
  if (summary.autoModelSelectedDisplayMessage) {
    const autoPercent = extractPercentage(summary.autoModelSelectedDisplayMessage);
    if (autoPercent) {
      lines.push(`📊 套餐用量占比: ${autoPercent}%`);
    }
  }

  // ── 用量明细 ──
  // 这个用量已经展示在 本周期已用: 这里了
  // lines.push(`  ├ Included 用量: ${formatCurrency(plan.used)} / ${formatCurrency(plan.limit)}`);
  if (onDemand.enabled) {
    lines.push(`└ On-Demand 用量: ${formatCurrency(onDemand.used)} 剩余: ${formatCurrency(COMPANY_ON_DEMAND_LIMIT_CENTS - onDemand.used)}`);
    if (COMPANY_ON_DEMAND_LIMIT_CENTS - onDemand.used < 0) {
      lines.push(`🚨 警告: On-Demand 已超出公司限额 ${formatCurrency(COMPANY_ON_DEMAND_LIMIT_CENTS)}！`);
      lines.push(`超出 ${formatCurrency(onDemand.used - COMPANY_ON_DEMAND_LIMIT_CENTS)} 将从工资扣除！`);
    }
  }

  // ── On-Demand 费用警告 ──
  if (onDemand.enabled && onDemand.used > 0) {
    lines.push('');
    const companyLimitStr = formatCurrency(COMPANY_ON_DEMAND_LIMIT_CENTS);
    if (onDemand.used >= COMPANY_ON_DEMAND_LIMIT_CENTS) {
      const overAmount = onDemand.used - COMPANY_ON_DEMAND_LIMIT_CENTS;
      lines.push(`🚨 警告: On-Demand 已超出公司限额 ${companyLimitStr}！`);
      lines.push(`超出 ${formatCurrency(overAmount)} 将从工资扣除！`);
    } else {
      const remaining = COMPANY_ON_DEMAND_LIMIT_CENTS - onDemand.used;
      lines.push(`⚠️ 提醒: 已进入 On-Demand 计费区间`);
      lines.push(`公司 On-Demand 额度剩余: ${formatCurrency(remaining)} / ${companyLimitStr}`);
    }
  }

  // ── 团队用量 ──
  if (teamOnDemand.used > 0) {
    lines.push(`👥 团队 On-Demand: ${formatCurrency(teamOnDemand.used)}`);
  }

  // ── 最近使用记录（使用代码块保持等宽对齐）──
  if (currentUsageEvents && currentUsageEvents.length > 0) {
    lines.push('');
    lines.push('**--- 最近使用记录 ---**');

    // 列宽定义: Time=11, Type=9, Model=24, Token=8, Cost=8
    const COL = { time: 11, type: 9, model: 24, token: 8, cost: 8 };
    const tableLines: string[] = [];

    const header = [
      'Time'.padEnd(COL.time),
      'Type'.padEnd(COL.type),
      'Model'.padEnd(COL.model),
      'Token'.padStart(COL.token),
      'Cost'.padStart(COL.cost),
    ].join(' | ');
    tableLines.push(header);
    tableLines.push('-'.repeat(header.length));

    for (const event of currentUsageEvents) {
      const time = formatTimestamp(event.timestamp).padEnd(COL.time);
      // 判断计费类型：kind 为 usage_based 的为 On-Demand
      const chargeType = (event.kind === USAGE_EVENT_KIND_USAGE_BASED ? 'On-Demand' : 'Included').padEnd(COL.type);
      const model = event.model.padEnd(COL.model);
      const totalTokens = (event.tokenUsage.inputTokens || 0) + (event.tokenUsage.outputTokens || 0) + (event.tokenUsage.cacheWriteTokens || 0) + (event.tokenUsage.cacheReadTokens || 0);
      const tokens = formatTokenCount(totalTokens).padStart(COL.token);
      const cost = `$${(event.tokenUsage.totalCents / 100).toFixed(2)}`.padStart(COL.cost);
      tableLines.push(`${time} | ${chargeType} | ${model} | ${tokens} | ${cost}`);
    }

    // 用代码块包裹表格，确保等宽字体 + 空格不被压缩
    lines.push('```');
    lines.push(...tableLines);
    lines.push('```');
  }

  lines.push('');
  lines.push('💡 点击在浏览器中打开完整详情');

  // Markdown 中单个 \n 不换行，需要行尾加两个空格实现硬换行
  // 空行和代码块内的行不需要处理
  let inCodeBlock = false;
  const mdText = lines.map(line => {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    // 代码块内不处理，空行不处理
    if (inCodeBlock || line === '') {
      return line;
    }
    return line + '  '; // 行尾两个空格 = Markdown 硬换行
  }).join('\n');

  const md = new vscode.MarkdownString(mdText);
  md.isTrusted = true;
  return md;
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
    // sendNotification(percentage, highestThreshold, totalUsed, totalLimit);
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
