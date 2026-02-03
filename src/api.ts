import * as https from 'https';

/**
 * API 响应数据类型定义
 */
export interface UsageSummary {
    billingCycleStart: string;
    billingCycleEnd: string;
    membershipType: string;
    limitType: string;
    isUnlimited: boolean;
    autoModelSelectedDisplayMessage: string;
    namedModelSelectedDisplayMessage: string;
    individualUsage: {
        plan: {
            enabled: boolean;
            used: number;
            limit: number;
            remaining: number;
            breakdown: {
                included: number;
                bonus: number;
                total: number;
            };
            autoSpend: number;
            apiSpend: number;
            autoLimit: number;
            apiLimit: number;
            autoPercentUsed: number;
            apiPercentUsed: number;
            totalPercentUsed: number;
        };
        onDemand: {
            enabled: boolean;
            used: number;
            limit: number | null;
            remaining: number | null;
        };
    };
    teamUsage: {
        onDemand: {
            enabled: boolean;
            used: number;
            limit: number | null;
            remaining: number | null;
        };
    };
}

/**
 * Token 使用详情
 */
export interface TokenUsage {
    inputTokens?: number;
    outputTokens?: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    totalCents: number;
}

/**
 * 单条使用事件
 */
export interface UsageEvent {
    timestamp: string;
    model: string;
    kind: string;
    requestsCosts: number;
    usageBasedCosts: string;
    isTokenBasedCall: boolean;
    tokenUsage: TokenUsage;
    owningUser: string;
    owningTeam: string;
    cursorTokenFee: number;
    isChargeable: boolean;
    isHeadless: boolean;
}

/**
 * 使用事件响应
 */
export interface UsageEventsResponse {
    totalUsageEventsCount: number;
    usageEventsDisplay: UsageEvent[];
}

/**
 * 调用 Cursor API 获取使用情况摘要
 * @param cookie Cookie 字符串
 * @returns 使用情况摘要数据
 */
export async function fetchUsageSummary(cookie: string): Promise<UsageSummary> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'cursor.com',
            port: 443,
            path: '/api/usage-summary',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://cursor.com/cn/dashboard?tab=usage',
                'Cookie': cookie,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        };

        const req = https.request(options, (res: any) => {
            let data = '';

            // 处理 gzip 压缩
            const encoding = res.headers['content-encoding'];
            let stream: any = res;

            if (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br') {
                const zlib = require('zlib');
                if (encoding === 'gzip') {
                    stream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    stream = res.pipe(zlib.createInflate());
                } else if (encoding === 'br') {
                    stream = res.pipe(zlib.createBrotliDecompress());
                }
            }

            stream.on('data', (chunk: any) => {
                data += chunk;
            });

            stream.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        reject(new Error(`API 请求失败，状态码: ${res.statusCode}`));
                        return;
                    }

                    const json = JSON.parse(data);
                    resolve(json);
                } catch (error) {
                    reject(new Error(`解析响应失败: ${error}`));
                }
            });
        });

        req.on('error', (error: any) => {
            reject(new Error(`网络请求失败: ${error.message}`));
        });

        req.end();
    });
}

/**
 * 调用 Cursor API 获取使用事件列表
 * @param cookie Cookie 字符串
 * @param limit 获取的记录数量，默认 10
 * @returns 使用事件响应数据
 */
export async function fetchUsageEvents(cookie: string, limit: number = 10): Promise<UsageEventsResponse> {
    return new Promise((resolve, reject) => {
        // 构建请求体 - 尝试不同的参数格式
        const requestBody = JSON.stringify({});

        const options = {
            hostname: 'cursor.com',
            port: 443,
            path: '/api/dashboard/get-filtered-usage-events',
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                'Accept-Encoding': 'gzip, deflate, br',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
                'Referer': 'https://cursor.com/cn/dashboard?tab=usage',
                'Cookie': cookie,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        };

        const req = https.request(options, (res: any) => {
            let data = '';

            // 处理 gzip 压缩
            const encoding = res.headers['content-encoding'];
            let stream: any = res;

            if (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br') {
                const zlib = require('zlib');
                if (encoding === 'gzip') {
                    stream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    stream = res.pipe(zlib.createInflate());
                } else if (encoding === 'br') {
                    stream = res.pipe(zlib.createBrotliDecompress());
                }
            }

            stream.on('data', (chunk: any) => {
                data += chunk;
            });

            stream.on('end', () => {
                try {
                    console.log('使用事件 API 状态码:', res.statusCode);
                    if (res.statusCode !== 200) {
                        console.log('使用事件 API 响应内容:', data);
                        reject(new Error(`API 请求失败，状态码: ${res.statusCode}`));
                        return;
                    }

                    const json = JSON.parse(data);
                    console.log('使用事件 API 返回记录数:', json.usageEventsDisplay?.length || 0);
                    // 只返回前 limit 条记录
                    if (json.usageEventsDisplay && json.usageEventsDisplay.length > limit) {
                        json.usageEventsDisplay = json.usageEventsDisplay.slice(0, limit);
                    }
                    resolve(json);
                } catch (error) {
                    console.log('使用事件 API 解析失败，原始数据:', data);
                    reject(new Error(`解析响应失败: ${error}`));
                }
            });
        });

        req.on('error', (error: any) => {
            console.log('使用事件 API 网络错误:', error.message);
            reject(new Error(`网络请求失败: ${error.message}`));
        });

        // 发送请求体
        req.write(requestBody);
        req.end();
    });
}

/**
 * 格式化时间戳为可读格式
 * @param timestamp 毫秒时间戳字符串
 * @returns 格式化后的时间字符串 (MM-DD HH:mm)
 */
export function formatTimestamp(timestamp: string): string {
    const date = new Date(parseInt(timestamp, 10));
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
}

/**
 * 简化模型名称显示
 * @param model 完整模型名称
 * @returns 简化后的模型名称
 */
export function formatModelName(model: string): string {
    // 移除常见前缀和后缀，简化显示
    const simplifications: Record<string, string> = {
        'claude-4.5-opus-high-thinking': 'opus-4.5',
        'claude-4-opus': 'opus-4',
        'claude-3.5-sonnet': 'sonnet-3.5',
        'gpt-5.2-codex-high': 'gpt-5.2-h',
        'gpt-5.2-codex': 'gpt-5.2',
        'gpt-4-turbo': 'gpt-4t',
        'gpt-4o': 'gpt-4o',
        'composer-1': 'composer',
        'default': 'default'
    };
    return simplifications[model] || model.substring(0, 12);
}

/**
 * 格式化 Token 数量（简化大数字显示）
 * @param tokens Token 数量
 * @returns 格式化后的字符串
 */
export function formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`;
    }
    return String(tokens);
}

/**
 * 格式化美元金额
 * @param amount 金额（美元）
 * @returns 格式化后的字符串，如 "$123.45"
 */
export function formatCurrency(amount: number): string {
    amount = amount / 100.0;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

/**
 * 计算总使用情况和限额
 * @param summary 使用情况摘要
 * @param customOnDemandLimit 自定义 onDemand 限额（美元），如果为 null 则使用 API 返回的值
 * @returns 总使用情况数据
 */
export interface TotalUsage {
    totalUsed: number;      // plan.used + onDemand.used
    totalLimit: number;     // plan.limit + onDemandLimit
    totalRemaining: number; // totalLimit - totalUsed
    percentage: number;     // (totalUsed / totalLimit) * 100
    planUsed: number;
    planLimit: number;
    onDemandUsed: number;
    onDemandLimit: number;
}

export function calculateTotalUsage(summary: UsageSummary, customOnDemandLimit: number | null): TotalUsage {
    const plan = summary.individualUsage.plan;
    const onDemand = summary.individualUsage.onDemand;
    const planUsed = typeof plan.breakdown?.total === 'number' ? plan.breakdown.total : plan.used;

    // 使用自定义限制或 API 返回的限制
    const onDemandLimit = customOnDemandLimit !== null
        ? customOnDemandLimit
        : (onDemand.limit !== null ? onDemand.limit : 0);

    const totalUsed = planUsed + onDemand.used;
    const totalLimit = plan.limit + onDemandLimit;
    const totalRemaining = (totalLimit - totalUsed);
    const percentage = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

    return {
        totalUsed,
        totalLimit,
        totalRemaining,
        percentage,
        planUsed,
        planLimit: plan.limit,
        onDemandUsed: onDemand.used,
        onDemandLimit
    };
}

/**
 * 根据使用百分比获取颜色
 * @param percentage 使用百分比 (0-100)
 * @returns 颜色字符串（VS Code 主题颜色或十六进制）
 */
export function getUsageColor(percentage: number): string {
    if (percentage < 50) {
        return '#4EC9B0'; // 绿色 - 使用率低
    } else if (percentage < 80) {
        return '#DCDCAA'; // 黄色 - 使用率中等
    } else if (percentage < 90) {
        return '#CE9178'; // 橙色 - 使用率较高
    } else {
        return '#F48771'; // 红色 - 使用率很高
    }
}

/**
 * 根据使用百分比获取对应的小球 emoji
 * @param percentage 使用百分比 (0-100)
 * @returns 小球 emoji 字符串
 */
export function getUsageIndicator(percentage: number): string {
    if (percentage < 50) {
        return '🟢'; // 绿色 - 使用率低
    } else if (percentage < 80) {
        return '🟡'; // 黄色 - 使用率中等
    } else if (percentage < 90) {
        return '🟠'; // 橙色 - 使用率较高
    } else {
        return '🔴'; // 红色 - 使用率很高
    }
}

/**
 * 生成文本进度条（保留用于向后兼容）
 * @param percentage 使用百分比 (0-100)
 * @param length 进度条长度（字符数），默认 10
 * @returns 文本进度条字符串
 */
export function generateProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * 格式化使用情况为显示文本
 * @param summary 使用情况摘要
 * @param customOnDemandLimit 自定义 onDemand 限额
 * @param showProgressBar 是否显示进度条，默认 true（现在使用小球代替）
 * @param isUnlimited 是否无限额套餐，true 时只显示已用金额
 * @returns 格式化后的文本
 */
export function formatUsageDisplay(
    summary: UsageSummary,
    customOnDemandLimit: number | null = null,
    showProgressBar: boolean = true,
    isUnlimited: boolean = false
): string {
    const total = calculateTotalUsage(summary, customOnDemandLimit);
    const usedStr = formatCurrency(total.totalUsed);

    // 无限额套餐：只显示已用金额，不显示限额和百分比
    if (isUnlimited) {
        const indicator = getUsageIndicator(0); // 无限额时使用绿色指示器
        return `${indicator} 已用: ${usedStr}`;
    }

    const limitStr = formatCurrency(total.totalLimit);

    if (showProgressBar) {
        // 使用小球指示器代替进度条
        const indicator = getUsageIndicator(total.percentage);
        return `${indicator} ${total.percentage}% | ${usedStr}/${limitStr}`;
    } else {
        return `Cursor: ${usedStr}/${limitStr} (${total.percentage}%)`;
    }
}

/**
 * 获取简短的使用情况文本
 * @param summary 使用情况摘要
 * @param customOnDemandLimit 自定义 onDemand 限额
 * @param isUnlimited 是否无限额套餐
 * @returns 简短文本
 */
export function getShortUsageText(
    summary: UsageSummary,
    customOnDemandLimit: number | null = null,
    isUnlimited: boolean = false
): string {
    const total = calculateTotalUsage(summary, customOnDemandLimit);
    const usedStr = formatCurrency(total.totalUsed);

    // 无限额套餐：只显示已用金额
    if (isUnlimited) {
        return `$(pulse) 已用: ${usedStr}`;
    }

    const limitStr = formatCurrency(total.totalLimit);
    return `$(pulse) ${usedStr}/${limitStr}`;
}

