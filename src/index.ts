import path from 'path'
import os from 'os'
import YAML from 'yaml'
import { $, cd, useBash, usePowerShell, usePwsh, quotePowerShell } from 'zx'
import RssParser from 'rss-parser'
import fs from 'fs-extra'
import { to } from 'await-to-js'
import log4js from 'log4js'
import pLimit from 'p-limit'

const logger = log4js.getLogger('rss-resources-download')

logger.level = process.env.LOGGER_LEVEL || 'debug'

if (os.platform() === 'win32') { // 如果是 Windows 系统，则切换到 PowerShell
    usePowerShell()
    $.quote = quotePowerShell
    logger.debug('usePowerShell')
}

const rssParser = new RssParser()

const limit = pLimit(Number(process.env.P_LIMIT || 1))

interface Config {
    rssList: string[]
    cookiePaths: Record<string, string>
    dataPath: string
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

const { rssList = [], cookiePaths = {}, dataPath: _dataPath = './data' } = CONFIG

const dataPath = path.resolve(_dataPath) // 解析为绝对路径

if (!await fs.pathExists(dataPath)) {
    await fs.mkdir(dataPath)
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
            const cookiePath = cookiePaths[link.host]
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
            await ls
        }
    }

}))

await Promise.allSettled(input)
