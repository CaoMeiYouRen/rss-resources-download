import path from 'path'
import os from 'os'
import YAML from 'yaml'
import { $, usePowerShell } from 'zx'
import RssParser from 'rss-parser'
import fs from 'fs-extra'
import { to } from 'await-to-js'
import log4js from 'log4js'
import { configDotenv } from 'dotenv'
import PQueue from 'p-queue'
import { CronJob } from 'cron'
import { getCloudCookie, cloudCookie2File } from './utils/cookie'
import { BaiduPCS } from './utils/baidu'
import { getCookiePath, parseJsonArray, sanitizeFilename, uniqUpload } from './utils/helper'
import { Config } from './types'
import { timeFormat } from './utils/time'

configDotenv({
    path: ['.env.local', '.env'],
})

const logger = log4js.getLogger('rss-resources-download')

logger.level = process.env.LOGGER_LEVEL || 'debug'

if (os.platform() === 'win32') { // 如果是 Windows 系统，则切换到 PowerShell
    usePowerShell()
    // $.quote = quote
    logger.debug('usePowerShell')
}

const rssParser = new RssParser()

const [error1, configFile] = await to(fs.readFile('config.yml', 'utf8'))
if (error1) {
    logger.error('未检测到 config.yml 配置文件，请配置后重试！\n', error1.stack)
    process.exit(1)
}

// 导入配置
const CONFIG = YAML.parse(configFile) as Config

logger.debug(CONFIG)

const { rssList = [], dataPath: _dataPath = './data', uploadLimit = 1, downloadLimit = 1, cookieCloudUrl, cookieCloudPassword, bduss, uploadPath, cronTime = '' } = CONFIG
// 下载并发限制
const downloadQueue = new PQueue({ concurrency: downloadLimit || 1 })

// 上传队列
const uploadQueue = new PQueue({ concurrency: uploadLimit || 1 })

// 检查 you-get 是否已安装
const [error2] = await to($`you-get -V`.pipe(process.stdout))
if (error2) {
    logger.error('未检测到 you-get ，请安装后重试！\n', error2.stack)
    process.exit(1)
}

// 检查 BaiduPCS-Go 是否已安装
const [errorBaidu] = await to($`BaiduPCS-Go -v`.pipe(process.stdout))
if (errorBaidu) {
    logger.error('未检测到 BaiduPCS-Go ，请安装后重试！\n', errorBaidu.stack)
    process.exit(1)
}

// 检查 BaiduPCS-Go 是否已登录
if ((await BaiduPCS.who()).text()?.includes('uid: 0')) { // 未登录
    logger.info((await BaiduPCS.loginByBduss(bduss)).stdout)
}

// 获取 Cookie
if (cookieCloudUrl) {
    const data = await getCloudCookie(cookieCloudUrl, cookieCloudPassword)
    await cloudCookie2File(data)
}

const dataPath = path.resolve(_dataPath) // 解析为绝对路径

if (!await fs.pathExists(dataPath)) {
    await fs.mkdir(dataPath)
}

// 检查本地文件是否已上传
const files = await fs.readdir(dataPath)

files.forEach((file) => {
    uploadQueue.add(async () => {
        const filepath = path.join(dataPath, file)
        if (await uniqUpload(filepath, uploadPath)) {
            const filename = path.basename(filepath)
            logger.info(`上传文件 ${filename} 成功`)
        }
    })
})

const task = async () => {
    const input = rssList.map((rss) => async () => {
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
                const infoFlags = [
                    link.toString(),
                    cookiePath && '-c', //  Load cookies.txt or cookies.sqlite
                    cookiePath && `${path.resolve(cookiePath)}`, //  Load cookies.txt or cookies.sqlite
                    '--playlist', //  download all parts.
                    '--json', // 输出 json 格式
                ]
                const text = (await $`you-get ${infoFlags}`).stdout
                const infos = parseJsonArray(text)
                for await (const info of infos) {
                    const filename = sanitizeFilename(info.title)
                    const url = info.url
                    const flags = [
                        url, // 分 P 链接
                        cookiePath && '-c', //  Load cookies.txt or cookies.sqlite
                        cookiePath && `${path.resolve(cookiePath)}`, //  Load cookies.txt or cookies.sqlite
                        '-o', //  Set output directory
                        dataPath, //  Set output directory
                        '-O',
                        filename, // Set output filename
                        // '--playlist', // download all parts.
                    ].filter(Boolean)
                    const cmd = `you-get ${flags.join(' ')}`
                    logger.info(cmd)
                    const ls = $`you-get ${flags}`.pipe(process.stdout).verbose()
                    await to(ls)
                    logger.info(`下载文件 ${filename}.mp4 成功`)
                    // 下载完成后将该文件添加到上传队列中
                    uploadQueue.add(async () => {
                        const filepath = path.join(dataPath, `${filename}.cmt.xml`) // 上传弹幕文件
                        if (await uniqUpload(filepath, uploadPath)) {
                            const _filename = path.basename(filepath)
                            logger.info(`上传文件 ${_filename} 成功`)
                        }
                    })
                    uploadQueue.add(async () => {
                        const filepath = path.join(dataPath, `${filename}.mp4`) // 上传视频文件
                        if (await uniqUpload(filepath, uploadPath)) {
                            const _filename = path.basename(filepath)
                            logger.info(`上传文件 ${_filename} 成功`)
                        }
                    })
                }
            }
        }

    })

    await downloadQueue.addAll(input)
}

if (cronTime) {
    const job = new CronJob(cronTime,
        async () => {
            logger.info('开始执行定时任务')
            await task()
            logger.info('定时任务执行完毕')
            logger.info(`下次执行时间：${timeFormat(job.nextDate().toJSDate())}`)
        },
        null,
        false,
        'Asia/Shanghai',
    )
    job.start()
    logger.info('定时任务已启动')
    logger.info(`下次执行时间：${timeFormat(job.nextDate().toJSDate())}`)
} else {
    await task()
}
