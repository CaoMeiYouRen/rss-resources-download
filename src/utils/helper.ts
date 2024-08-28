import path from 'path'
import fs from 'fs-extra'
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
