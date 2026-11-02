import Database from 'better-sqlite3'
import { DataSource } from 'typeorm'
import { Article } from './models/article'
import { Resource } from './models/resource'

export async function getDataSource(database: string) {
    const dataSource = new DataSource({
        type: 'better-sqlite3',
        database,
        driver: Database, // 显式传入驱动，避免 typeorm 动态 require 导致打包时依赖丢失
        entities: [Article, Resource],
        synchronize: true,
    })
    await dataSource.initialize()
    return dataSource
}
