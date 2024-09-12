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
    // 在文件名中不合法的字符
    const unsafeChars = /[/?<>\\:*|":]/g
    // 定义非法字符集合
    // 匹配所有不符合中日文字、英文、数字、下划线和连字符的字符
    // 中文字符：\u4E00-\u9FFF
    // 日文平假名：\u3040-\u309F
    // 日文片假名：\u30A0-\u30FF
    // 日文汉字：\u4E00-\u9FFF
    // 日文其他字符：\u3005\u3007\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FD-\u30FF\u31F0-\u31FF\u32D0-\u32FE\u3300-\u33FF\uFF66-\uFF9F\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A
    const illegalChars = /[^a-zA-Z0-9_\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005\u3007\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FD-\u30FF\u31F0-\u31FF\u32D0-\u32FE\u3300-\u33FF\uFF66-\uFF9F\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g
    // 将非法字符替换为下划线
    return filename.replace(illegalChars, '_').replace(unsafeChars, '_')
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
