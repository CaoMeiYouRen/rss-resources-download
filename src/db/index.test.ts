import 'reflect-metadata'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DataSource } from 'typeorm'
import { Article } from './models/article'
import { Resource } from './models/resource'
import { getDataSource } from './index'

describe('getDataSource', () => {
    let tmpDir: string
    let database: string
    let dataSource: DataSource

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rss-resources-download-'))
        database = path.join(tmpDir, 'database.db')
        dataSource = await getDataSource(database)
    })

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.destroy()
        }
        await fs.remove(tmpDir)
    })

    it('使用 typeorm 当前支持的 sqlite 驱动完成初始化', () => {
        // typeorm 1.x 移除了 sqlite 驱动，此处锁定驱动名，避免依赖大版本升级后静默失效
        expect(dataSource.isInitialized).toBe(true)
        expect(dataSource.options.type).toBe('better-sqlite3')
    })

    it('可以写入并读取 Resource', async () => {
        const repository = dataSource.getRepository(Resource)
        await repository.save(repository.create({
            name: 'test.mp4',
            type: 'video',
            size: 1024,
            downloadStatus: 'success',
            uploadStatus: 'unknown',
        }))
        const resource = await repository.findOneBy({ name: 'test.mp4' })
        expect(resource).toMatchObject({ type: 'video', size: 1024, downloadStatus: 'success' })
        expect(await repository.count()).toBe(1)
    })

    it('可以写入并读取 Article', async () => {
        const repository = dataSource.getRepository(Article)
        await repository.save(repository.create({ link: 'https://example.com/rss', title: '测试文章' }))
        const article = await repository.findOneBy({ link: 'https://example.com/rss' })
        expect(article).toMatchObject({ title: '测试文章' })
    })

    it('重新打开数据库后数据仍然存在', async () => {
        await dataSource.destroy()
        dataSource = await getDataSource(database)
        expect(await dataSource.getRepository(Resource).count()).toBe(1)
        expect(await dataSource.getRepository(Article).count()).toBe(1)
    })
})
