import 'reflect-metadata'
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
import { fileTypeFromFile } from 'file-type'
import { runPushAllInOne } from 'push-all-in-one'
import { getCloudCookie, cloudCookie2File } from './utils/cookie'
import { BaiduPCS } from './utils/baidu'
import { getCookiePath, getFileMimeType, legitimize, parseJsonArray, sanitizeFilename, uniqUpload } from './utils/helper'
import { Config } from './types'
import { timeFormat } from './utils/time'
import { getDataSource } from './db'
import { Article } from './db/models/article'
import { Resource } from './db/models/resource'

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

let configPath = path.resolve(process.cwd(), './config.yml')// 尝试读取 config.yml 配置文件

if (!await fs.pathExists(configPath)) {
    configPath = path.resolve(process.cwd(), './config/config.yml') // 尝试读取 config/config.yml 配置文件
}

if (!await fs.pathExists(configPath)) {
    logger.error('未检测到 config.yml 配置文件，请配置后重试！')
    process.exit(1)
}

logger.info(`当前配置文件路径为：${configPath}`)

const [error1, configFile] = await to(fs.readFile(configPath, 'utf8'))
if (error1) {
    logger.error('未检测到 config.yml 配置文件，请配置后重试！\n', error1.stack)
    process.exit(1)
}

// 导入配置
const CONFIG = YAML.parse(configFile) as Config

logger.debug(CONFIG)

const {
    rssList = [],
    dataPath: _dataPath = './data',
    uploadLimit = 1,
    downloadLimit = 1,
    rssLimit = 1,
    cookieCloudUrl,
    cookieCloudPassword,
    bduss,
    uploadPath,
    cronTime = '',
    autoRemove = false,
    pushConfigs = [],
} = CONFIG

const rssQueue = new PQueue({ concurrency: rssLimit || 1 })

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

const dataPath = path.resolve(_dataPath) // 解析为绝对路径

if (!await fs.pathExists(dataPath)) {
    await fs.mkdir(dataPath)
}

const databaseDir = path.resolve('./database')

if (!await fs.pathExists(databaseDir)) {
    await fs.mkdir(databaseDir)
}

const dataSource = await getDataSource(path.join(databaseDir, 'database.db'))

const articleRepository = dataSource.getRepository(Article)
const resourceRepository = dataSource.getRepository(Resource)

// 检查本地文件是否已上传
// 同步本地文件到数据库
const files = await fs.readdir(dataPath)

for await (const file of files) {
    if (file.endsWith('.download')) { // 过滤未下载完成的文件
        continue
    }
    if (file.startsWith('.')) { // 过滤隐藏文件
        continue
    }
    if (!await resourceRepository.findOne({ where: { name: file } })) { // 如果没在数据库，则写入记录
        const filepath = path.normalize(path.join(dataPath, file))
        if (!await fs.pathExists(filepath)) { // 如果有表情字符会解析失败
            continue
        }
        const size = (await fs.stat(filepath))?.size
        const type = await getFileMimeType(filepath)
        if (!size || !type) { // 过滤没有文件类型和文件大小的文件
            continue
        }
        const newResource: Partial<Resource> = {
            url: '',
            name: file,
            localPath: filepath,
            remotePath: `${uploadPath}/${file}`,
            type,
            size,
            downloadStatus: 'success',
            uploadStatus: 'unknown',
        }
        await resourceRepository.save(newResource)
    }
}

// 查询 文件上传状态 为 unknown 的
const localResources = await resourceRepository.find({ where: { uploadStatus: 'unknown' } })

uploadQueue.addAll(localResources.map((r) => async () => {
    if (await uniqUpload(r.localPath, uploadPath)) {
        r.uploadStatus = 'success'
    } else {
        r.uploadStatus = 'fail'
    }
    await resourceRepository.save(r)
    if (r.uploadStatus === 'success' && autoRemove) {
        await fs.remove(r.localPath) // 自动删除
    }
}))

const task = async () => {

    // 获取 Cookie
    if (cookieCloudUrl) {
        logger.info('正在获取 Cookie')
        const [cookieError, data] = await to(getCloudCookie(cookieCloudUrl, cookieCloudPassword))
        if (cookieError) {
            logger.error('获取 Cookie失败！\n', cookieError.stack)
        } else if (data) {
            await cloudCookie2File(data)
            logger.info('获取 Cookie 成功')
        }
    }

    const input = rssList.map((rss) => async () => {
        const [error3, feed] = await to(rssParser.parseURL(rss))
        if (error3) {
            logger.error(`请求 rss "${rss}" 失败！\n`, error3.stack)
            return
        }
        const { title, items } = feed
        logger.info(`正在下载 ${title} 的资源……`)
        const downloadInput = items.map((item) => async () => {
            if (!item.link) {
                return
            }
            const link = new URL(item.link).toString()
            // 检查该 rss link 是否已下载过
            if (await articleRepository.findOne({ where: { link } })) { // 如果已经下载，则跳过
                return
            }
            const newArticle: Partial<Article> = {
                link: link?.slice(0, 2048),
                title: item.title?.slice(0, 256),
            }
            await articleRepository.save(newArticle)

            const host = new URL(item.link).host
            const cookiePath = await getCookiePath(host)
            // 部分情况下添加 --playlist 参数会获取失败（例如：在 B 站视频为特殊页面时，而不是普通视频时）
            const infoFlags = [
                link,
                cookiePath && '-c', //  Load cookies.txt or cookies.sqlite
                cookiePath && `${path.resolve(cookiePath)}`, //  Load cookies.txt or cookies.sqlite
                '--json', // 输出 json 格式
                '--playlist', //  download all parts.
            ].filter(Boolean)
            let [infoError, infoOutput] = await to($`you-get ${infoFlags}`)
            if (infoError) {
                logger.error(`获取 ${link} 文件信息失败`, infoError.stack)
                infoFlags.pop(); // 删除最后一个参数 '--playlist'
                // 重新发起请求
                [infoError, infoOutput] = await to($`you-get ${infoFlags}`)
                if (infoError) { // 如果还失败就退出
                    logger.error(`获取 ${link} 文件信息失败`, infoError.stack)
                    return
                }
            }
            const text = infoOutput.stdout
            const infos = parseJsonArray(text) // 一个视频可能有多个分 P
            for await (const info of infos) {
                const url = info.url
                let videoTitle = info.title
                // 如果是 B 站视频链接，则提取 id
                // https://www.bilibili.com/video/av113475133317016?p=1
                // https://www.bilibili.com/video/BV1Zmt6egEMP?p=1
                if (url.startsWith('https://www.bilibili.com/video/')) {
                    const id = url.match(/av(\d+)/i)?.[0] || url.match(/BV(\w+)/i)?.[0]
                    if (id) {
                        videoTitle += ` [${id}]`
                    }
                }

                const filename = sanitizeFilename(videoTitle)

                // 检查 .mp4 文件是否被下载
                const videoFilename = `${filename}.mp4`

                // 检查该 url 是否被下载过
                let resource: Partial<Resource> = await resourceRepository.findOne({ where: { url, name: videoFilename } })
                if (!resource) {
                    resource = {
                        url,
                        name: videoFilename,
                        localPath: path.join(dataPath, videoFilename),
                        remotePath: `${uploadPath}/${videoFilename}`,
                        type: '',
                        size: 0,
                        downloadStatus: 'unknown',
                        uploadStatus: 'unknown',
                    }
                    resource = await resourceRepository.save(resource)
                }
                if (resource.uploadStatus === 'success') { // 如果已下载并上传了，则跳过
                    return
                }
                if (resource.downloadStatus !== 'success') { // 如果不为 success，则重新下载
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
                    const [downloadError] = await to(ls)
                    if (downloadError) {
                        logger.error(`下载文件 ${videoFilename} 失败`)
                        resource.downloadStatus = 'fail'
                    } else {
                        logger.info(`下载文件 ${videoFilename} 成功`)
                        resource.downloadStatus = 'success'
                        const filepath = path.join(dataPath, videoFilename)
                        const size = (await fs.stat(filepath)).size
                        const type = await getFileMimeType(filepath)
                        resource.size = size
                        resource.type = type
                    }
                    resource = await resourceRepository.save(resource)
                }
                // 下载完成后将该文件添加到上传队列中
                uploadQueue.add(async () => {
                    const filepath = path.join(dataPath, videoFilename) // 上传视频文件
                    if (!await fs.pathExists(filepath)) {
                        return
                    }
                    const [error] = await to(uniqUpload(filepath, uploadPath))
                    if (error) {
                        logger.error(`上传文件 ${videoFilename} 失败`)
                        resource.uploadStatus = 'fail'
                    } else {
                        logger.info(`上传文件 ${videoFilename} 成功`)
                        resource.uploadStatus = 'success'

                        if (pushConfigs?.length) {
                            await Promise.all(pushConfigs.map(async (pushConfig) => {
                                const { type, config, option } = pushConfig
                                const pushTitle = `上传文件 ${videoFilename} 成功`
                                const desp = `下载文件 ${videoFilename} 成功\n上传文件 ${videoFilename} 成功\n资源路径：${url}`
                                const [pushError] = await to(runPushAllInOne(pushTitle, desp, { type: type as any, config, option }))
                                if (pushError) {
                                    logger.error('推送失败', pushError.stack)
                                }
                            }))
                        }
                    }
                    await resourceRepository.save(resource)
                    if (resource.uploadStatus === 'success' && autoRemove) {
                        await fs.remove(resource.localPath) // 自动删除
                    }

                })
                // if (resource.downloadStatus === 'success') {
                // 检查 .cmt.xml 文件是否被下载
                uploadQueue.add(async () => {
                    let cmtFilename = `${legitimize(info.title)}.cmt.xml`
                    let filepath = path.join(dataPath, cmtFilename) // 上传弹幕文件
                    if (!await fs.pathExists(filepath)) {
                        return
                    }
                    const newFilename = `${filename}.cmt.xml`
                    cmtFilename = newFilename
                    const newFilepath = path.join(dataPath, newFilename)
                    // 跟 filename 相同
                    await fs.rename(filepath, newFilepath)
                    filepath = newFilepath
                    if (!await fs.pathExists(filepath)) {
                        return
                    }

                    const size = (await fs.stat(filepath)).size
                    const type = await getFileMimeType(filepath)
                    let cmtResource: Partial<Resource> = resourceRepository.create({
                        ...resource,
                        id: undefined,
                        name: cmtFilename,
                        localPath: filepath,
                        remotePath: `${uploadPath}/${cmtFilename}`,
                        type,
                        size,
                        downloadStatus: 'success',
                        uploadStatus: 'unknown',
                    })
                    cmtResource = await resourceRepository.save(cmtResource)
                    const [error] = await to(uniqUpload(filepath, uploadPath))
                    if (error) {
                        logger.error(`上传文件 ${cmtFilename} 失败`)
                        cmtResource.uploadStatus = 'fail'
                    } else {
                        logger.info(`上传文件 ${cmtFilename} 成功`)
                        cmtResource.uploadStatus = 'success'
                    }
                    await resourceRepository.save(cmtResource)
                    if (cmtResource.uploadStatus === 'success' && autoRemove) {
                        await fs.remove(cmtResource.localPath) // 自动删除
                    }
                })
                // }
            }

        })
        await downloadQueue.addAll(downloadInput)
    })

    await rssQueue.addAll(input)
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
    uploadQueue.on('idle', async () => {
        await dataSource.destroy()
    })
}
