import path from 'path'
import fs from 'fs-extra'
import { BaiduPCS } from './baidu'
import { VideoInfo } from '@/types'
/**
 * 获取主域名
 *
 * @author CaoMeiYouRen
 * @date 2024-08-27
 * @param domain
 */
export function extractMainDomain(domain: string) {
    // 移除协议部分（如http:// 或 https://）
    domain = domain.replace(/(^\w+:|^)\/\//, '')

    // 移除路径部分
    domain = domain.split('/')[0]

    // 使用正则表达式提取主域名
    const parts = domain.split('.')
    const tld = parts.pop() // 假设最后一个部分是顶级域名（TLD）
    const sld = parts.pop() // 假设倒数第二个部分是二级域名（SLD）

    // 组合主域名
    const mainDomain = `${sld}.${tld}`

    return mainDomain
}

export async function getCookiePath(host: string) {
    // 先查找完整域名的 cookie
    let cookiePath = path.resolve(`cookies/${host}.txt`)
    if (await fs.pathExists(cookiePath)) {
        return cookiePath
    }
    // 再查找主域名的 cookie
    cookiePath = path.resolve(`cookies/${extractMainDomain(host)}.txt`)
    if (await fs.pathExists(cookiePath)) {
        return cookiePath
    }
    // 未查找到返回空
    return ''
}

/**
 * 获取安全的文件名
 *
 * @author CaoMeiYouRen
 * @date 2024-08-28
 * @export
 * @param filename
 */
export function sanitizeFilename(filename: string): string {
    // 定义非法字符集合
    const illegalChars = /[/?<>\\:*|":]/g
    // 定义表情符号的正则表达式
    // 一个广泛接受的表情符号正则表达式，涵盖了大部分常见的表情符号。
    // 如果文件路径中有表情符号，会导致 fs.stat 的 ENOENT 错误
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu
    // 将非法字符替换为下划线
    return filename.replace(illegalChars, '_').replace(emojiRegex, '_')
}

/**
 *
 * 解析 you-get 的 json 输出信息
 * @author CaoMeiYouRen
 * @date 2024-08-28
 * @export
 * @param input
 */
export function parseJsonArray(input: string): VideoInfo[] {
    const jsonObjects = input.trim().split(/\}\s*\{/).map((obj) => {
        if (!obj.startsWith('{')) {
            obj = `{${obj}`
        }
        if (!obj.endsWith('}')) {
            obj += '}'
        }
        return obj
    })

    try {
        const jsonArray = jsonObjects.map((e) => {
            try {
                return JSON.parse(e)
            } catch (error) {
                console.error(error)
                return {}
            }
        })
        const parsedArray: VideoInfo[] = jsonArray
        return parsedArray
    } catch (error) {
        console.error('Error parsing JSON:', error)
        return []
    }
}

/**
 * 上传文件到网盘，但不重复上传
 *
 * @author CaoMeiYouRen
 * @date 2024-08-28
 * @param filepath 本地文件路径
 * @param uploadPath 远程文件夹路径
 */
export async function uniqUpload(filepath: string, uploadPath: string) {
    try {
        if (!await fs.pathExists(filepath)) {
            return
        }
        const filename = path.basename(filepath)
        const keyword = filename.slice(0, 20) // 搜索关键词不大于 22 个字符，否则报 31023
        // 上传之前先检查是否已经存在同名文件了，匹配 文件名
        const text = (await BaiduPCS.search(keyword, uploadPath)).text()
        if (text?.includes(filename)) { // 如果匹配到 文件名，说明已经存在了
            return
        }
        const output = await BaiduPCS.upload(filepath, uploadPath)
        console.info(`上传文件 ${filename} 成功`)
        return output
    } catch (error) {
        console.error(error)
    }
}
