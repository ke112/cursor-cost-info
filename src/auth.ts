import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

/**
 * 根据操作系统返回 Cursor 的 globalStorage 数据库路径
 * @returns state.vscdb 文件的绝对路径
 */
function getCursorStoragePath(): string {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
        case 'darwin':
            return path.join(
                homeDir,
                'Library',
                'Application Support',
                'Cursor',
                'User',
                'globalStorage',
                'state.vscdb'
            );
        case 'linux':
            return path.join(
                homeDir,
                '.config',
                'Cursor',
                'User',
                'globalStorage',
                'state.vscdb'
            );
        case 'win32':
            return path.join(
                process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
                'Cursor',
                'User',
                'globalStorage',
                'state.vscdb'
            );
        default:
            throw new Error(`不支持的操作系统: ${platform}`);
    }
}

/**
 * 通过系统 sqlite3 命令行工具执行查询
 * @param dbPath SQLite 数据库文件路径
 * @param query SQL 查询语句
 * @returns 查询结果字符串
 */
function querySqlite(dbPath: string, query: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            'sqlite3',
            [dbPath, query],
            { timeout: 5000 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (stderr && stderr.trim().length > 0) {
                    reject(new Error(stderr.trim()));
                    return;
                }
                resolve(stdout.trim());
            }
        );
    });
}

/**
 * 从 Cursor IDE 本地 SQLite 数据库读取 accessToken
 * Cursor 登录后会将 JWT 格式的 accessToken 存储在
 * globalStorage/state.vscdb 的 ItemTable 表中
 * @returns accessToken 字符串，读取失败或未登录则返回 null
 */
export async function readCursorAccessToken(): Promise<string | null> {
    try {
        const dbPath = getCursorStoragePath();

        if (!fs.existsSync(dbPath)) {
            return null;
        }

        const token = await querySqlite(
            dbPath,
            "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken';"
        );

        if (token && token.trim().length > 0) {
            return token.trim();
        }

        return null;
    } catch {
        return null;
    }
}
