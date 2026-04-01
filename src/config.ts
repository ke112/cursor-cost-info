import * as vscode from 'vscode';
import { readCursorAccessToken, readStoredAuthSession } from './auth';

const CURSOR_COOKIE_DOMAIN = 'cursor.com';

/** 默认公司 On-Demand 限额（美元） */
const DEFAULT_COMPANY_ON_DEMAND_LIMIT = 0;

/**
 * 获取公司 On-Demand 限额配置（美元）
 * 用户可在 VSCode 设置中配置 cursorCostInfo.companyOnDemandLimit
 */
export function getCompanyOnDemandLimit(): number {
    const config = vscode.workspace.getConfiguration('cursorCostInfo');
    const limit = config.get<number>('companyOnDemandLimit', DEFAULT_COMPANY_ON_DEMAND_LIMIT);
    return limit;
}

/**
 * 认证凭据类型
 * token: 从 Cursor 本地存储读取的 JWT accessToken，配合 api2.cursor.sh 使用
 * cookie: 从浏览器读取的 Cookie，配合 cursor.com 使用
 */
export interface AuthCredentials {
    type: 'token' | 'cookie';
    value: string;
}

/**
 * 从浏览器读取 cursor.com 的 Cookie（备用方案）
 * 支持 Chrome、Firefox、Safari 等（平台支持见 @mherod/get-cookie 文档）
 * @returns Cookie 字符串，失败或未找到则返回 null
 */
async function readCursorCookieFromBrowser(): Promise<string | null> {
    try {
        const { getCookie } = await import('@mherod/get-cookie');
        const cookies = await getCookie({ name: '%', domain: CURSOR_COOKIE_DOMAIN });
        if (!cookies || cookies.length === 0) {
            return null;
        }
        const cookieHeader = cookies
            .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
            .join('; ');
        return cookieHeader.trim() || null;
    } catch {
        return null;
    }
}

/**
 * 统一认证解析，按优先级依次尝试：
 * 1. Cursor 本地 SQLite 数据库中的 accessToken（自动登录，零配置）
 * 2. Extension 自己的存储会话（Web 授权后存储的，备用）
 * 3. 浏览器中 cursor.com 的 Cookie（备用方案）
 * @returns 认证凭据，全部失败则返回 null
 */
export async function resolveAuth(): Promise<AuthCredentials | null> {
    // 优先从 Cursor SQLite 读取（真正的登录状态，作为权威来源）
    const token = await readCursorAccessToken();
    if (token) {
        return { type: 'token', value: token };
    }

    // SQLite 数据库存在但无 token，说明用户已退出登录，不再使用备用方案
    // 仅当 SQLite 数据库不存在时（非 Cursor 环境），才尝试备用方案
    try {
        const { getCursorStoragePath } = await import('./auth');
        const dbPath = getCursorStoragePath();
        const { existsSync } = await import('fs');
        if (existsSync(dbPath)) {
            return null;
        }
    } catch {}

    // SQLite 不存在，使用备用方案
    const storedSession = readStoredAuthSession();
    if (storedSession?.accessToken) {
        return { type: 'token', value: storedSession.accessToken };
    }

    const browserCookie = await readCursorCookieFromBrowser();
    if (browserCookie && browserCookie.length > 10) {
        return { type: 'cookie', value: browserCookie };
    }

    return null;
}

/**
 * 获取配置说明文本
 */
export function getConfigHelpText(): string {
    return '插件将自动读取 Cursor 登录信息，请确保已登录 Cursor';
}
