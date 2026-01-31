import * as vscode from 'vscode';

const CURSOR_COOKIE_DOMAIN = 'cursor.com';

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
 * 从 VS Code 配置或浏览器读取 Cursor Cookie
 * 优先使用本地配置 cursorCostInfo.cookie；若未配置则尝试从浏览器 cookie 中读取 cursor.com 的 cookie
 * @returns Cookie 字符串，若均不可用则返回 null
 */
export async function readCursorCookie(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('cursorCostInfo');
    const cookie = config.get<string>('cookie', '');

    if (cookie && cookie.trim() !== '') {
        return cookie.trim();
    }

    return readCursorCookieFromBrowser();
}

/**
 * 获取配置说明文本
 */
export function getConfigHelpText(): string {
    return '请在 VS Code 设置中配置 cursorCostInfo.cookie，或确保已在浏览器中登录 cursor.com';
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

    // 简单验证：Cookie 应该包含一些常见的字段
    // 可以根据实际需要调整验证逻辑
    return cookie.length > 10;
}

