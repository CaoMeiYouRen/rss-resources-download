import path from 'path'
import fs from 'fs-extra'
import type { Logger } from 'log4js'
import { to } from 'await-to-js'
import { downloadWithYouGet } from './youget'
import { downloadWithYutto, isBilibiliUrl, isYuttoAvailable } from './yutto'

export interface DownloadOptions {
    url: string
    outputDir: string
    outputFilename?: string
    cookiePath?: string
    logger?: Logger
}

/**
 * 下载资源
 *
 * B 站视频优先使用 yutto 下载（you-get 对部分 DASH 视频流下载失败），
 * yutto 不可用或下载失败时回退到 you-get。其它站点仍使用 you-get。
 */
export async function downloadResource(options: DownloadOptions) {
    const { url, outputDir, outputFilename, logger } = options

    if (isBilibiliUrl(url) && await isYuttoAvailable()) {
        const [yuttoError] = await to(downloadWithYutto(options))
        if (!yuttoError) {
            return
        }
        const message = yuttoError instanceof Error ? (yuttoError.stack || yuttoError.message) : String(yuttoError)
        logger?.warn(`yutto 下载 ${url} 失败，尝试使用 you-get 重试`, message)
        if (outputFilename) {
            // 清理 yutto 可能留下的不完整文件，避免 you-get 误判为已下载
            const yuttoArtifacts = [
                `${outputFilename}.mp4`,
                `${outputFilename}.mkv`,
                `${outputFilename}.mov`,
                `${outputFilename}.xml`,
                `${outputFilename}.ass`,
                `${outputFilename}.cmt.xml`,
            ]
            await Promise.all(yuttoArtifacts.map((name) => fs.remove(path.join(outputDir, name)).catch(() => undefined)))
        }
    }

    await downloadWithYouGet(options)
}
