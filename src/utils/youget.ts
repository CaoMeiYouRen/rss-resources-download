import path from 'path'
import type { Logger } from 'log4js'
import { $ } from 'zx'
import { parseJsonArray } from './helper'
import type { VideoInfo } from '@/types'

type Arg = string | false | null | undefined

function normalizeArgs(args: Arg[]): string[] {
    return args.filter((arg): arg is string => Boolean(arg))
}

function buildCookieArgs(cookiePath?: string): string[] {
    if (!cookiePath) {
        return []
    }
    return ['-c', path.resolve(cookiePath)]
}

async function runYouGet(args: Arg[]) {
    const normalizedArgs = normalizeArgs(args)
    return $`you-get ${normalizedArgs}`
}

function formatCommand(args: string[]) {
    return ['you-get', ...args].join(' ')
}

function logError(logger: Logger | undefined, message: string, error: unknown) {
    if (!logger) {
        return
    }
    const errMsg = error instanceof Error ? (error.stack || error.message) : String(error)
    logger.error(message, errMsg)
}

let youGetAvailable: boolean | undefined

/**
 * 检查 you-get 是否可用
 */
export async function isYouGetAvailable(): Promise<boolean> {
    if (youGetAvailable !== undefined) {
        return youGetAvailable
    }
    try {
        await $({ verbose: false })`you-get -V`
        youGetAvailable = true
    } catch {
        youGetAvailable = false
    }
    return youGetAvailable
}

export async function ensureYouGetInstalled() {
    if (!await isYouGetAvailable()) {
        throw new Error('you-get 未安装')
    }
}

export interface YouGetInfoOptions {
    cookiePath?: string
    includePlaylist?: boolean
    logger?: Logger
}

export async function fetchYouGetInfos(link: string, options: YouGetInfoOptions = {}): Promise<VideoInfo[]> {
    const { cookiePath, includePlaylist = true, logger } = options
    const args: Arg[] = [
        link,
        ...buildCookieArgs(cookiePath),
        '--json',
        includePlaylist && '--playlist',
    ]
    try {
        const output = await runYouGet(args)
        return parseJsonArray(output.stdout)
    } catch (error) {
        logError(logger, `获取 ${link} 文件信息失败`, error)
        if (!includePlaylist) {
            throw error
        }
        const fallbackArgs: Arg[] = [
            link,
            ...buildCookieArgs(cookiePath),
            '--json',
        ]
        try {
            const output = await runYouGet(fallbackArgs)
            return parseJsonArray(output.stdout)
        } catch (fallbackError) {
            logError(logger, `获取 ${link} 文件信息失败`, fallbackError)
            throw fallbackError
        }
    }
}

export interface YouGetDownloadOptions {
    url: string
    outputDir: string
    outputFilename?: string
    cookiePath?: string
    extraArgs?: string[]
    logger?: Logger
}

export async function downloadWithYouGet(options: YouGetDownloadOptions) {
    const { url, outputDir, outputFilename, cookiePath, extraArgs = [], logger } = options
    const args: Arg[] = [
        url,
        ...buildCookieArgs(cookiePath),
        '-o',
        outputDir,
        outputFilename && '-O',
        outputFilename,
        ...extraArgs,
    ]
    const normalizedArgs = normalizeArgs(args)
    if (logger) {
        logger.info(formatCommand(normalizedArgs))
    }
    await runYouGet(args)
}
