import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { calculateTotalUsage, fetchUsageEvents, fetchUsageSummaryAuto, formatCurrency, formatTimestamp, formatTokenCount, formatUsageDisplay, getUsageColor, USAGE_EVENT_KIND_USAGE_BASED, UsageEvent, UsageSummary } from './api';
import { readCursorCachedEmail } from './auth';
import { getCompanyOnDemandLimit, getConfigHelpText, resolveAuth } from './config';

/** 刷新间隔（毫秒） */
const REFRESH_INTERVAL = 30000;

/** 通知阈值百分比列表 */
const NOTIFICATION_THRESHOLDS = [80, 85, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: NodeJS.Timeout | undefined;
let currentSummary: UsageSummary | undefined;
let lastNotificationPercentage: number | null = null;
let currentUsageEvents: UsageEvent[] = [];
let currentEmail: string | null = null;
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

  // ── 自动重载机制 ──
  // 打包脚本安装新版本后 touch ~/.cursor-cost-info/.reload-trigger
  // 插件通过 fs.watchFile (polling) 检测到 mtime 变化，自动执行 Reload Window
  // 优势：不依赖键盘模拟、不依赖 URI Scheme、不受窗口焦点/输入法影响
  setupAutoReloadWatcher(context);

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
 * 设置自动重载文件监听器
 * 打包脚本安装新版本后 touch ~/.cursor-cost-info/.reload-trigger，
 * 插件检测到 mtime 变化后自动执行 workbench.action.reloadWindow
 */
function setupAutoReloadWatcher(context: vscode.ExtensionContext) {
  const RELOAD_TRIGGER_DIR = path.join(os.homedir(), '.cursor-cost-info');
  const RELOAD_TRIGGER_FILE = path.join(RELOAD_TRIGGER_DIR, '.reload-trigger');
  const POLL_INTERVAL_MS = 2000;

  try {
    // 确保触发文件目录和文件存在
    if (!fs.existsSync(RELOAD_TRIGGER_DIR)) {
      fs.mkdirSync(RELOAD_TRIGGER_DIR, { recursive: true });
    }
    if (!fs.existsSync(RELOAD_TRIGGER_FILE)) {
      fs.writeFileSync(RELOAD_TRIGGER_FILE, '', 'utf-8');
    }

    // fs.watchFile 基于 stat polling，跨平台最可靠（不依赖 inotify/kqueue/FSEvents）
    fs.watchFile(RELOAD_TRIGGER_FILE, { interval: POLL_INTERVAL_MS }, (curr, prev) => {
      // 文件存在（mtimeMs > 0）且 mtime 发生变化时触发重载
      if (curr.mtimeMs > 0 && curr.mtimeMs !== prev.mtimeMs) {
        console.log('[Cursor Cost Info] 检测到 .reload-trigger 变化，自动重载窗口...');
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });

    // 扩展停用时清理 watcher
    context.subscriptions.push({
      dispose: () => {
        fs.unwatchFile(RELOAD_TRIGGER_FILE);
      }
    });

    console.log('[Cursor Cost Info] 自动重载监听已启动:', RELOAD_TRIGGER_FILE);
  } catch (err) {
    // 非关键功能，失败不影响插件正常使用
    console.error('[Cursor Cost Info] 自动重载监听设置失败:', err);
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
      statusBarItem.command = 'cursor.costInfo.refresh';
      statusBarItem.color = undefined;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
      return;
    }

    currentEmail = await readCursorCachedEmail();
    const summary = await fetchUsageSummaryAuto(auth);

    // 获取使用事件
    try {
      const usageEventsResponse = await fetchUsageEvents(
        auth,
        summary.billingCycleStart,
        summary.billingCycleEnd,
        1000
      );
      if (usageEventsResponse && usageEventsResponse.usageEventsDisplay) {
        currentUsageEvents = usageEventsResponse.usageEventsDisplay;
      }
    } catch (err) {
      console.error('获取使用事件失败:', err);
    }

    currentSummary = summary;

    const companyOnDemandLimitCents = getCompanyOnDemandLimit() * 100;
    const total = calculateTotalUsage(summary, companyOnDemandLimitCents);

    const displayText = formatUsageDisplay(summary, companyOnDemandLimitCents, true, summary.isUnlimited);
    statusBarItem.text = displayText;

    const autoPercentMatch = summary.autoModelSelectedDisplayMessage?.match(/(\d+)%/);
    const displayPercent = autoPercentMatch ? parseInt(autoPercentMatch[1], 10) : total.percentage;

    if (summary.isUnlimited) {
      statusBarItem.color = getUsageColor(0);
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.color = getUsageColor(displayPercent);
      if (displayPercent >= 90) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (displayPercent >= 80) {
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
    statusBarItem.tooltip = `错误: ${error instanceof Error ? error.message : '未知错误'}\n先查看浏览器中是否登录成功且能正常访问，如正常则点击立即重试\n\n💡 点击立即重试`;
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

  // 个人本周期总用量 = 套餐内 + onDemand（与状态栏保持一致）
  const individualTotalUsed = total.totalUsed;

  const lines: string[] = [];

  lines.push('<b>--- Cursor 使用情况 ---</b>');

  // ── 当前账号 ──
  if (currentEmail) {
    lines.push(`👤 账号: ${currentEmail}`);
  }

  // ── 周期重置倒计时 ──
  const countdown = formatCountdown(summary.billingCycleEnd);
  lines.push(`📅 距离本周期重置: ${countdown}`);

  // ── 本周期已用（合并后的唯一值）──
  // autoPercent 来自 API 的 displayMessage，是套餐配额的真实占比，避免用 totalUsed/planLimit 出现超 100% 的异常
  const autoPercentStr = summary.autoModelSelectedDisplayMessage
    ? extractPercentage(summary.autoModelSelectedDisplayMessage)
    : null;
  // 转换为数字进行比较
  const autoPercent = autoPercentStr ? parseInt(autoPercentStr, 10) : null;

  if (summary.isUnlimited) {
    lines.push(`💰 本周期个人用量: ${formatCurrency(individualTotalUsed)}`);
  } else if (autoPercent !== null && autoPercent < 100) {
    lines.push(`💰 本周期个人用量: ${formatCurrency(individualTotalUsed)} (套餐内已用 ${autoPercent}%)`);
  } else if (autoPercent !== null && autoPercent >= 100) {
    // 套餐内已用超过100%时，显示已用/剩余更合理
    lines.push(`💰 本周期个人用量: ${formatCurrency(individualTotalUsed)}`);
  } else {
    lines.push(`💰 本周期个人用量: ${formatCurrency(individualTotalUsed)} / ${formatCurrency(total.totalLimit)}`);
  }

  const onDemandUsed = onDemand.used;

  // ── On-Demand 用量明细 ──
  if (onDemand.enabled) {
    const companyLimit = getCompanyOnDemandLimit() * 100;
    const remaining = companyLimit - onDemandUsed;
    const overAmount = onDemandUsed - companyLimit;

    if (overAmount > 0) {
      lines.push(`🔴 套餐外剩余额度: <span style="color:#ff4d4f;">已超出 ${formatCurrency(overAmount)}，超出部分将从工资扣除！</span>`);
    } else if (remaining <= companyLimit * 0.2) {
      lines.push(`🟡 套餐外剩余额度: <span style="color:#e8a838;">${formatCurrency(remaining)}，请注意控制用量</span>`);
    } else {
      lines.push(`🟢 套餐外剩余额度: ${formatCurrency(remaining)}`);
    }
  }
  
  // ── 团队用量 ──
  if (teamOnDemand.used > 0) {
    lines.push(`👥 本周期团队共用: ${formatCurrency(teamOnDemand.used)}`);
  }

  // ── 最近使用记录（使用代码块保持等宽对齐）──
  if (currentUsageEvents && currentUsageEvents.length > 0) {
    lines.push('');
    lines.push('<b>--- 最近使用记录 ---</b>');

    // 计算平均用量：总消耗 / 有消耗的天数
    const plan = summary.individualUsage.plan;
    const onDemand = summary.individualUsage.onDemand;
    const totalUsed = (plan.breakdown?.total ?? plan.used) + onDemand.used;

    // 统计有实际消耗的天数（去重日期）
    const activeDays = new Set<string>();
    for (const event of currentUsageEvents) {
      if (event.tokenUsage.totalCents != null && event.tokenUsage.totalCents > 0) {
        const eventDate = new Date(parseInt(event.timestamp, 10)).toISOString().split('T')[0];
        activeDays.add(eventDate);
      }
    }
    const daysWithUsage = Math.max(1, activeDays.size);
    const averageUsage = Math.round(totalUsed / daysWithUsage);

    // 计算今日用量：筛选今天的使用记录并累加
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    let todayUsage = 0;
    for (const event of currentUsageEvents) {
      const eventDate = new Date(parseInt(event.timestamp, 10)).toISOString().split('T')[0];
      if (eventDate === todayStr && event.tokenUsage.totalCents != null) {
        todayUsage += event.tokenUsage.totalCents;
      }
    }

    lines.push(`📊 平均用量: ${formatCurrency(averageUsage)}/天 (共${daysWithUsage}天有消耗)`);
    lines.push(`📅 今日用量: ${formatCurrency(todayUsage)}`);

    // 列宽定义: Time=11, Type=9, Model=25, Tokens=9, Cost=8
    const COL = { time: 11, type: 9, model: 25, token: 9, cost: 8 };
    const tableLines: string[] = [];

    // 计算字符串的显示宽度（中文/全角字符占2个宽度）
    const displayWidth = (str: string): number => {
      let width = 0;
      for (const ch of str) {
        const code = ch.codePointAt(0) || 0;
        // CJK 统一汉字、全角字符等占 2 个宽度
        if (
          (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK 统一汉字
          (code >= 0x3400 && code <= 0x4DBF) ||   // CJK 扩展 A
          (code >= 0xFF01 && code <= 0xFF60) ||   // 全角 ASCII
          (code >= 0x3000 && code <= 0x303F)      // CJK 标点
        ) {
          width += 2;
        } else {
          width += 1;
        }
      }
      return width;
    };

    // 按显示宽度右对齐
    const padStartDisplay = (str: string, targetWidth: number): string => {
      const currentWidth = displayWidth(str);
      const padding = Math.max(0, targetWidth - currentWidth);
      return ' '.repeat(padding) + str;
    };

    // 按显示宽度左对齐
    const padEndDisplay = (str: string, targetWidth: number): string => {
      const currentWidth = displayWidth(str);
      const padding = Math.max(0, targetWidth - currentWidth);
      return str + ' '.repeat(padding);
    };

    const header = [
      'Time'.padEnd(COL.time),
      'Type'.padEnd(COL.type),
      'Model'.padEnd(COL.model),
      padStartDisplay('Tokens', COL.token),
      'Cost'.padStart(COL.cost),
    ].join(' | ');
    tableLines.push(header);
    tableLines.push('-'.repeat(header.length));

    for (const event of currentUsageEvents) {
      const time = formatTimestamp(event.timestamp).padEnd(COL.time);
      // 判断计费类型：kind 为 usage_based 的为 On-Demand
      const chargeType = (event.kind === USAGE_EVENT_KIND_USAGE_BASED ? 'On-Demand' : 'Included').padEnd(COL.type);
      // 模型名最多展示 25 个字符，超出截断并加省略号
      const modelName = event.model.length > 25 ? event.model.slice(0, 24) + '…' : event.model;
      const model = padEndDisplay(modelName, COL.model);
      const totalTokens = (event.tokenUsage.inputTokens || 0) + (event.tokenUsage.outputTokens || 0) + (event.tokenUsage.cacheWriteTokens || 0) + (event.tokenUsage.cacheReadTokens || 0);
      const tokens = padStartDisplay(formatTokenCount(totalTokens), COL.token);
      const cost = (event.tokenUsage.totalCents == null ? '-' : `$${(event.tokenUsage.totalCents / 100).toFixed(2)}`).padStart(COL.cost);
      tableLines.push(`${time} | ${chargeType} | ${model} | ${tokens} | ${cost}`);
    }

    // 用代码块包裹表格，确保等宽字体 + 空格不被压缩
    lines.push('```');
    lines.push(...tableLines);
    lines.push('```');
  }

  lines.push('');
  lines.push('💡 点击在浏览器中打开完整详情');

  // 统一使用 HTML <br/> 换行，避免 Markdown 行尾双空格与 HTML 标签混用导致颜色失效
  let inCodeBlock = false;
  const mdText = lines.map(line => {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    // 代码块内保留原始换行
    if (inCodeBlock) {
      return line;
    }
    // 空行用 <br/> 产生间距
    if (line === '') {
      return '<br/>';
    }
    return line + '<br/>';
  }).join('\n');

  const md = new vscode.MarkdownString(mdText);
  md.isTrusted = true;
  md.supportHtml = true;
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
