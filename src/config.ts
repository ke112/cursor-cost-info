import * as vscode from 'vscode';
import { readCursorAccessToken } from './auth';

const CURSOR_COOKIE_DOMAIN = 'cursor.com';

/**
 * 认证凭据类型
 * token: 从 Cursor 本地存储读取的 JWT accessToken，配合 api2.cursor.sh 使用
 * cookie: 手动配置或从浏览器读取的 Cookie，配合 cursor.com 使用
 */
export interface AuthCredentials {
    type: 'token' | 'cookie';
    value: string;
}

/**
 * 从浏览器读取 cursor.com 的 Cookie（当本地未配置时使用）
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
 * 从 VS Code 配置读取手动设置的 Cookie
 * @returns Cookie 字符串，若未配置则返回 null
 */
function readManualCookie(): string | null {
    const config = vscode.workspace.getConfiguration('cursorCostInfo');
    const cookie = config.get<string>('cookie', '');

    if (cookie && cookie.trim() !== '') {
        return cookie.trim();
    }

    return null;
}

/**
 * 统一认证解析，按优先级依次尝试：
 * 1. VS Code 设置中手动配置的 Cookie（用户显式覆盖）
 * 2. Cursor 本地 SQLite 数据库中的 accessToken（自动登录，零配置）
 * 3. 浏览器中 cursor.com 的 Cookie
 * @returns 认证凭据，全部失败则返回 null
 */
export async function resolveAuth(): Promise<AuthCredentials | null> {
    const manualCookie = readManualCookie();
    if (manualCookie && validateCookie(manualCookie)) {
        return { type: 'cookie', value: manualCookie };
    }

    const token = await readCursorAccessToken();
    if (token) {
        return { type: 'token', value: token };
    }

    const browserCookie = await readCursorCookieFromBrowser();
    if (browserCookie && validateCookie(browserCookie)) {
        return { type: 'cookie', value: browserCookie };
    }

    return null;
}

/**
 * 获取配置说明文本
 */
export function getConfigHelpText(): string {
    return '插件将自动读取 Cursor 登录信息。如自动获取失败，请在设置中手动配置 cursorCostInfo.cookie';
}

/**
 * 验证 Cookie 格式
 * @param cookie Cookie 字符串
 * @returns 是否有效
 */
export function validateCookie(cookie: string | null): boolean {
    if (!cookie) {
        return false;
    }

    return cookie.length > 10;
}
