import path from 'path'
import fs from 'fs-extra'
import type { Logger } from 'log4js'
import { $ } from 'zx'
import { parse, stringify } from 'smol-toml'
import type { VideoInfo } from '@/types'

/**
 * yutto 的默认配置，下载 B 站视频时使用
 */
const DEFAULT_YUTTO_CONFIG: Record<string, any> = {
    basic: {
        dir: './data',
        tmp_dir: './data/tmp',
        vip_strict: false, // 不强制要求大会员，避免无大会员时直接失败
        login_strict: false, // 不强制要求登录，未登录时自动降级清晰度
        danmaku_format: 'xml', // 弹幕格式 xml
        output_format: 'mp4',
        subpath_template: '{name}', // 单个视频直接存放在下载目录，不额外创建子目录
    },
    resource: {
        require_danmaku: true, // 显式开启弹幕，避免旧配置覆盖后不再下载弹幕
        require_subtitle: false,
        require_cover: false,
        require_chapter_info: false,
    },
    danmaku: { speed: 1 },
    batch: { with_extra_episodes: false },
}

function isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeConfig(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
            continue
        }
        if (isPlainObject(value) && isPlainObject(target[key])) {
            target[key] = mergeConfig(target[key], value)
            continue
        }
        target[key] = value
    }
    return target
}

/**
 * 生成 yutto.toml 配置内容，用于后续调用 yutto 下载
 * @param config
 * @returns
 */
export function generateYuttoConfig(config: Record<string, any>): string {
    const newConfig = mergeConfig(structuredClone(DEFAULT_YUTTO_CONFIG), config)
    return stringify(newConfig)
}

export function parseYuttoConfig(tomlString: string): Record<string, any> {
    return parse(tomlString)
}

/**
 * 在没有 you-get 时，用 RSS 条目的标题构造一个最小的 B 站视频信息
 *
 * yutto 可以直接根据 URL 下载，不需要 you-get 的 JSON 解析结果。
 */
export function createBilibiliFallbackInfo(url: string, title?: string): VideoInfo {
    return {
        url,
        title: title || url,
        site: 'Bilibili',
        streams: {},
        extra: {
            referer: 'https://www.bilibili.com',
            ua: '',
        },
    }
}

/**
 * 判断链接是否为 yutto 支持的 B 站链接
 */
export function isBilibiliUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase()
        return hostname === 'bilibili.com'
            || hostname.endsWith('.bilibili.com')
            || hostname === 'b23.tv'
            || hostname.endsWith('.b23.tv')
    } catch {
        return false
    }
}

/**
 * 解析 Netscape 格式的 cookie 文件
 */
export function parseCookieFile(content: string): Map<string, string> {
    const cookies = new Map<string, string>()
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) {
            continue
        }
        // 浏览器导出的 Netscape cookie 文件可能给 HttpOnly cookie 加上该前缀
        const normalizedLine = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line
        if (normalizedLine.startsWith('#')) {
            continue
        }
        const parts = normalizedLine.split('\t')
        if (parts.length >= 7) {
            const name = parts[5]?.trim()
            const value = parts.slice(6).join('\t')
            if (name) {
                cookies.set(name, value)
            }
            continue
        }
        // 兼容 `SESSDATA=xxx; bili_jct=yyy` 形式的 cookie
        for (const pair of normalizedLine.split(';')) {
            const [name, ...rest] = pair.trim().split('=')
            if (name && rest.length) {
                cookies.set(name.trim(), rest.join('=').trim())
            }
        }
    }
    return cookies
}

/**
 * 从 cookie 文件中提取 yutto 需要的认证信息
 */
export async function getYuttoAuthFromCookieFile(cookiePath?: string): Promise<string | undefined> {
    if (!cookiePath || !await fs.pathExists(cookiePath)) {
        return undefined
    }
    const cookies = parseCookieFile(await fs.readFile(cookiePath, 'utf-8'))
    const sessdata = cookies.get('SESSDATA')
    if (!sessdata) {
        return undefined
    }
    return ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5']
        .map((key) => {
            const value = cookies.get(key)
            return value ? `${key}=${value}` : ''
        })
        .filter(Boolean)
        .join('; ')
}

let yuttoAvailable: boolean | undefined

/**
 * 检查 yutto 是否可用
 */
export async function isYuttoAvailable(): Promise<boolean> {
    if (yuttoAvailable !== undefined) {
        return yuttoAvailable
    }
    try {
        await $`yutto --version`
        yuttoAvailable = true
    } catch {
        yuttoAvailable = false
    }
    return yuttoAvailable
}

/**
 * 转义 Python format 模板中的花括号，避免文件名被当作模板变量
 */
export function escapeYuttoTemplate(text: string): string {
    return text.replaceAll('{', '{{').replaceAll('}', '}}')
}

export interface YuttoDownloadOptions {
    url: string
    outputDir: string
    outputFilename?: string
    cookiePath?: string
    extraArgs?: string[]
    logger?: Logger
}

async function runYuttoCommand(
    outputDir: string,
    args: string[],
    auth: string | undefined,
    logger: Logger | undefined,
) {
    const tmpDir = path.join(
        outputDir,
        `.yutto-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    await fs.ensureDir(tmpDir)
    const commandArgs = [...args, '--tmp-dir', tmpDir]

    if (logger) {
        // 日志中不能输出完整的 Cookie
        const logArgs = auth ? commandArgs.map((arg) => arg === auth ? '***' : arg) : commandArgs
        logger.info(['yutto', ...logArgs].join(' '))
    }

    try {
        // 单独关闭 yutto 的命令回显，避免 Cookie 被 zx 打印到日志
        await $({ verbose: false })`yutto ${commandArgs}`
    } finally {
        await fs.remove(tmpDir).catch(() => undefined)
    }
}

/**
 * 在下载目录中查找本次下载新生成的 xml 弹幕文件
 *
 * 正常情况下弹幕就是 `<outputFilename>.xml`，这里仅作为 yutto 命名差异时的兜底。
 * 只有恰好一个新 xml 时才返回，避免并发下载时拿错文件。
 */
async function findSingleNewXml(outputDir: string, since: number): Promise<string | undefined> {
    const entries = await fs.readdir(outputDir, { withFileTypes: true })
    const candidates: { filePath: string, mtimeMs: number }[] = []
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue
        }
        const lowerName = entry.name.toLowerCase()
        if (!lowerName.endsWith('.xml') || lowerName.endsWith('.cmt.xml')) {
            continue
        }
        const filePath = path.join(outputDir, entry.name)
        try {
            const stat = await fs.stat(filePath)
            if (stat.mtimeMs >= since - 5000) {
                candidates.push({ filePath, mtimeMs: stat.mtimeMs })
            }
        } catch {
            // 文件可能在扫描期间被移动或删除，忽略即可
        }
    }
    if (candidates.length !== 1) {
        return undefined
    }
    return candidates[0].filePath
}

/**
 * 使用 yutto 下载 B 站视频
 *
 * yutto 与 you-get 的输出路径规则不同：
 * - 默认会按 `{name}` 或 `{title}/{name}` 生成文件名和子目录
 * - 弹幕文件为 `<视频文件名>.xml`，而不是 you-get 的 `.cmt.xml`
 *
 * 这里通过 `--subpath-template` 直接指定目标文件名，把视频固定输出为
 * `<outputDir>/<outputFilename>.mp4`，并把弹幕重命名为 `.cmt.xml`，
 * 从而保持与原有数据库、上传流程一致。
 *
 * 若主下载流程没有生成弹幕，会额外执行一次 `--danmaku-only`，
 * 避免只有视频、没有弹幕文件。
 */
export async function downloadWithYutto(options: YuttoDownloadOptions) {
    const { url, outputDir, outputFilename, cookiePath, extraArgs = [], logger } = options

    const auth = await getYuttoAuthFromCookieFile(cookiePath)
    const baseArgs = [url, '-d', outputDir]
    if (outputFilename) {
        baseArgs.push('-tp', escapeYuttoTemplate(outputFilename))
    }
    if (auth) {
        baseArgs.push('--auth', auth)
    }
    baseArgs.push(
        '-w',
        '-q', '116', // 与 you-get 原先选择的 1080P60 保持一致，避免默认 8K/4K 导致文件体积暴涨
        '-df', 'xml',
        '--no-subtitle',
        '--no-cover',
        '--no-chapter-info',
        '--output-format', 'mp4',
        ...extraArgs,
    )

    const startedAt = Date.now()
    await runYuttoCommand(outputDir, baseArgs, auth, logger)

    if (!outputFilename) {
        return
    }

    const videoPath = path.join(outputDir, `${outputFilename}.mp4`)
    if (!await fs.pathExists(videoPath)) {
        throw new Error(`yutto 下载完成，但未找到视频文件 ${videoPath}`)
    }

    let danmakuPath = path.join(outputDir, `${outputFilename}.xml`)
    if (!await fs.pathExists(danmakuPath)) {
        danmakuPath = await findSingleNewXml(outputDir, startedAt) ?? danmakuPath
    }

    // 主流程没有生成弹幕时，单独补下一次弹幕
    if (!await fs.pathExists(danmakuPath)) {
        logger?.warn(`yutto 未生成弹幕文件，尝试单独下载弹幕：${outputFilename}`)
        const danmakuArgs = [url, '-d', outputDir]
        if (outputFilename) {
            danmakuArgs.push('-tp', escapeYuttoTemplate(outputFilename))
        }
        if (auth) {
            danmakuArgs.push('--auth', auth)
        }
        danmakuArgs.push(
            '-w',
            '-df', 'xml',
            '--danmaku-only',
            '--no-subtitle',
            '--no-cover',
            '--no-chapter-info',
            '--no-progress',
        )
        try {
            await runYuttoCommand(outputDir, danmakuArgs, auth, logger)
        } catch (error) {
            const message = error instanceof Error ? (error.stack || error.message) : String(error)
            logger?.warn(`单独下载弹幕失败：${outputFilename}`, message)
        }
        danmakuPath = path.join(outputDir, `${outputFilename}.xml`)
        if (!await fs.pathExists(danmakuPath)) {
            danmakuPath = await findSingleNewXml(outputDir, startedAt) ?? danmakuPath
        }
    }

    if (await fs.pathExists(danmakuPath)) {
        const cmtPath = path.join(outputDir, `${outputFilename}.cmt.xml`)
        await fs.remove(cmtPath)
        await fs.move(danmakuPath, cmtPath, { overwrite: true })
        logger?.info(`弹幕文件已保存：${cmtPath}`)
        return
    }

    logger?.warn(`未获取到弹幕文件：${outputFilename}`)
}
