import path from 'path'
import os from 'os'
import YAML from 'yaml'
import { $, usePowerShell, quotePowerShell } from 'zx'
import RssParser from 'rss-parser'
import fs from 'fs-extra'
import { to } from 'await-to-js'
import log4js from 'log4js'
import pLimit from 'p-limit'
import { configDotenv } from 'dotenv'
import { getCloudCookie, cloudCookie2File } from './cookie'

configDotenv({
    path: ['.env.local', '.env'],
})

const logger = log4js.getLogger('rss-resources-download')

logger.level = process.env.LOGGER_LEVEL || 'debug'

if (os.platform() === 'win32') { // 如果是 Windows 系统，则切换到 PowerShell
    usePowerShell()
    $.quote = quotePowerShell
    logger.debug('usePowerShell')
}

const rssParser = new RssParser()

interface Config {
    rssList: string[]
    dataPath?: string
    pLimit?: number
    cookieCloudUrl?: string
    cookieCloudPassword?: string
}

const [error1, configFile] = await to(fs.readFile('config.yml', 'utf8'))
if (error1) {
    logger.error('未检测到 config.yml 配置文件，请配置后重试！\n', error1.stack)
    process.exit(1)
}

// 导入配置
const CONFIG = YAML.parse(configFile) as Config

logger.debug(CONFIG)

// 检查 you-get 是否已安装

const [error2, output] = await to($`you-get -V`)
if (error2) {
    logger.error('未检测到 you-get ，请安装后重试！\n', error2.stack)
    process.exit(1)
}

logger.info(output.stdout)

const { rssList = [], dataPath: _dataPath = './data', pLimit: _pLimit = 1, cookieCloudUrl, cookieCloudPassword } = CONFIG

const limit = pLimit(Number(_pLimit || 1))

// 获取 Cookie
if (cookieCloudUrl) {
    const data = await getCloudCookie(cookieCloudUrl, cookieCloudPassword)
    await cloudCookie2File(data)
}

const dataPath = path.resolve(_dataPath) // 解析为绝对路径

if (!await fs.pathExists(dataPath)) {
    await fs.mkdir(dataPath)
}
/**
 * 获取主域名
 *
 * @author CaoMeiYouRen
 * @date 2024-08-27
 * @param domain
 */
function extractMainDomain(domain: string) {
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

async function getCookiePath(host: string) {
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

const input = rssList.map((rss) => limit(async () => {
    const [error3, feed] = await to(rssParser.parseURL(rss))
    if (error3) {
        logger.error(`请求 rss "${rss}" 失败！\n`, error3.stack)
        return
    }
    const { title, items } = feed
    logger.info(`正在下载 ${title} 的资源……`)
    for await (const item of items) {
        if (item.link) {
            const link = new URL(item.link)
            const host = link.host
            const cookiePath = await getCookiePath(host)
            const flags = [
                link.toString(),
                cookiePath && '-c', //  Load cookies.txt or cookies.sqlite
                cookiePath && `${path.resolve(cookiePath)}`, //  Load cookies.txt or cookies.sqlite
                '-o', //  Set output directory
                dataPath, //  Set output directory
                '--playlist', // download all parts.
            ].filter(Boolean)
            const cmd = `you-get ${flags.join(' ')}`
            logger.info(cmd)
            const ls = $`you-get ${flags}`
            ls.stdout.on('data', (data) => {
                logger.info(String(data))
            })
            ls.stderr.on('data', (data) => {
                logger.error(String(data))
            })
            await to(ls)
        }
    }

}))

await Promise.allSettled(input)
