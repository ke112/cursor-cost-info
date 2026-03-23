import * as https from 'https';
import { extractUserIdFromToken } from './auth';
import { AuthCredentials } from './config';

/** Usage event kind: 按量计费 */
export const USAGE_EVENT_KIND_USAGE_BASED = 'usage_based';

/**
 * API 响应数据类型定义
 * 兼容两种 API 端点的响应格式：
 * - cursor.com/api/usage-summary（Cookie 认证）
 * - api2.cursor.sh/auth/usage-summary（Token 认证）
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
            autoSpend?: number;
            apiSpend?: number;
            autoLimit?: number;
            apiLimit?: number;
            autoPercentUsed?: number;
            apiPercentUsed?: number;
            totalPercentUsed?: number;
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
    chargedCents: number;
}

/**
 * 使用事件响应
 */
export interface UsageEventsResponse {
    totalUsageEventsCount: number;
    usageEventsDisplay: UsageEvent[];
}

/**
 * 根据认证类型自动选择 API 端点获取使用情况摘要
 * @param auth 认证凭据
 * @returns 使用情况摘要数据
 */
export async function fetchUsageSummaryAuto(auth: AuthCredentials): Promise<UsageSummary> {
    if (auth.type === 'token') {
        return fetchUsageSummaryWithToken(auth.value);
    }
    return fetchUsageSummary(auth.value);
}

/**
 * 使用 Cursor accessToken 调用 api2.cursor.sh 获取使用情况摘要
 * @param token Cursor 本地存储的 JWT accessToken
 * @returns 使用情况摘要数据
 */
export async function fetchUsageSummaryWithToken(token: string): Promise<UsageSummary> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api2.cursor.sh',
            port: 443,
            path: '/auth/usage-summary',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            }
        };

        const req = https.request(options, (res: any) => {
            let data = '';

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
                        reject(new Error(
                            `API 请求失败，状态码: ${res.statusCode}` +
                            (res.statusCode === 401 ? '（Token 已过期或无效）' : '')
                        ));
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
 * 使用 Cookie 调用 cursor.com API 获取使用情况摘要
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
 * 支持 Token 认证（从 token 构造 cookie）和直接 Cookie 认证
 * @param auth 认证凭据
 * @param billingCycleStart 计费周期开始时间 ISO 字符串
 * @param billingCycleEnd 计费周期结束时间 ISO 字符串
 * @param limit 获取的记录数量，默认 10
 * @returns 使用事件响应数据
 */
export async function fetchUsageEvents(
    auth: AuthCredentials,
    billingCycleStart: string,
    billingCycleEnd: string,
    limit: number = 10
): Promise<UsageEventsResponse> {
    // 构造 Cookie
    let cookie: string;
    if (auth.type === 'token') {
        const userId = extractUserIdFromToken(auth.value);
        if (!userId) {
            throw new Error('无法从 Token 中提取用户 ID');
        }
        cookie = `WorkosCursorSessionToken=${encodeURIComponent(userId + '::' + auth.value)}`;
    } else {
        cookie = auth.value;
    }

    // 构建请求体
    const startDate = String(new Date(billingCycleStart).getTime());
    const endDate = String(Date.now());
    const requestBody = JSON.stringify({
        startDate,
        endDate,
        page: 1,
        pageSize: limit
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'cursor.com',
            port: 443,
            path: '/api/dashboard/get-filtered-usage-events',
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
                'Origin': 'https://cursor.com',
                'Referer': 'https://cursor.com/cn/dashboard?tab=usage',
                'Cookie': cookie,
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            }
        };

        const req = https.request(options, (res: any) => {
            let data = '';

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
                        reject(new Error(`使用事件 API 请求失败，状态码: ${res.statusCode}`));
                        return;
                    }

                    const json = JSON.parse(data);
                    resolve(json);
                } catch (error) {
                    reject(new Error(`解析使用事件响应失败: ${error}`));
                }
            });
        });

        req.on('error', (error: any) => {
            reject(new Error(`使用事件网络请求失败: ${error.message}`));
        });

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
 * 格式化 Token 数量（简化大数字显示）
 * @param tokens Token 数量
 * @returns 格式化后的字符串
 */
export function formatTokenCount(tokens: number): string {
    if (tokens >= 100000000) {
        return `${parseFloat((tokens / 100000000).toFixed(1))}亿`;
    } else if (tokens >= 10000) {
        return `${parseFloat((tokens / 10000).toFixed(1))}万`;
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
    totalUsed: number;
    totalLimit: number;
    totalRemaining: number;
    percentage: number;
    planUsed: number;
    planLimit: number;
    onDemandUsed: number;
    onDemandLimit: number;
}

export function calculateTotalUsage(summary: UsageSummary, customOnDemandLimit: number | null): TotalUsage {
    const plan = summary.individualUsage.plan;
    const onDemand = summary.individualUsage.onDemand;
    const planUsed = typeof plan.breakdown?.total === 'number' ? plan.breakdown.total : plan.used;

    const onDemandLimit = customOnDemandLimit !== null
        ? customOnDemandLimit
        : (onDemand.limit !== null ? onDemand.limit : 0);

    const totalUsed = planUsed + onDemand.used;

    // 分母 = 套餐内已用总量 / (totalPercentUsed / 100) + 套餐外配置
    // API 返回的 totalPercentUsed 是百分比值（如 0.425 表示 0.425%），需要除以 100转为小数
    const planLimitInferred = plan.limit > 0 && plan.totalPercentUsed
        ? planUsed / (plan.totalPercentUsed / 100)
        : plan.limit;
    console.log('[Cursor Cost Info] percentage Debug:', {
        planUsed,
        totalPercentUsed: plan.totalPercentUsed,
        planLimitInferred,
        onDemandLimit,
        totalLimit: planLimitInferred + onDemandLimit,
        planTotal: planUsed + (planLimitInferred + onDemandLimit),
        result: (planUsed / (planLimitInferred + onDemandLimit)) * 100
    });
    const totalLimit = planLimitInferred + onDemandLimit;
    // 百分比 = 套餐内已用 / (套餐内总限额 + 套餐外限额)
    const percentage = totalLimit > 0 ? Math.round((planUsed / totalLimit) * 100) : 0;

    const totalRemaining = (totalLimit - totalUsed);

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
        return '#4EC9B0';
    } else if (percentage < 80) {
        return '#DCDCAA';
    } else if (percentage < 90) {
        return '#CE9178';
    } else {
        return '#F48771';
    }
}

/**
 * 根据使用百分比获取对应的小球 emoji
 * @param percentage 使用百分比 (0-100)
 * @returns 小球 emoji 字符串
 */
export function getUsageIndicator(percentage: number): string {
    if (percentage < 50) {
        return '🟢';
    } else if (percentage < 80) {
        return '🟡';
    } else if (percentage < 90) {
        return '🟠';
    } else {
        return '🔴';
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
    console.log('[Cursor Cost Info] 计算调试:', {
        planUsed: total.planUsed,
        planLimit: total.planLimit,
        onDemandUsed: total.onDemandUsed,
        onDemandLimit: total.onDemandLimit,
        totalLimit: total.totalLimit,
        totalUsed: total.totalUsed,
        percentage: total.percentage,
        totalPercentUsed: summary.individualUsage?.plan?.totalPercentUsed
    });
    const usedStr = formatCurrency(total.totalUsed);

    // 无限额套餐：只显示已用金额，不显示限额和百分比
    if (isUnlimited) {
        const indicator = getUsageIndicator(0);
        return `${indicator} 已用: ${usedStr}`;
    }

    // 计算精确百分比，保留2位小数
    const precisePercent = total.totalLimit > 0
        ? (total.planUsed / total.totalLimit) * 100
        : 0;
    const displayPercentStr = precisePercent < 1
        ? precisePercent.toFixed(2)
        : String(Math.round(precisePercent));
    const displayPercentNum = precisePercent < 1
        ? precisePercent
        : Math.round(precisePercent);

    if (showProgressBar) {
        const indicator = getUsageIndicator(displayPercentNum);
        return `${indicator} ${usedStr} | ${displayPercentStr}%`;
    } else {
        return `Cursor: ${usedStr} (${displayPercentStr}%)`;
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
