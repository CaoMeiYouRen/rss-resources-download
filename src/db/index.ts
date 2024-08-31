import { DataSource } from 'typeorm'
import { Article } from './models/article'
import { Resource } from './models/resource'

export async function getDataSource(database: string) {
    const dataSource = new DataSource({
        type: 'sqlite',
        database,
        entities: [Article, Resource],
        synchronize: true,
    })
    await dataSource.initialize()
    return dataSource
}
