import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export type StatusType = 'success' | 'fail' | 'unknown'

@Entity()
export class Resource {

    @PrimaryGeneratedColumn()
    id: number

    @Column({
        type: 'text',
        length: 65000,
        nullable: true,
    })
    url?: string

    // 文件名称
    @Column({
        length: 1024,
        nullable: true,
    })
    name?: string

    // 本地文件路径
    @Column({
        length: 2048,
        nullable: true,
    })
    localPath?: string

    // 远程文件路径
    @Column({
        length: 2048,
        nullable: true,
    })
    remotePath?: string

    // 文件类型
    @Column({
        length: 128,
    })
    type: string

    // 文件体积(B)
    @Column({})
    size: number

    // 文件下载状态
    @Column({
        length: 16,
    })
    downloadStatus: StatusType

    // 文件上传状态
    @Column({
        length: 16,
    })
    uploadStatus: StatusType

    @Index()
    @CreateDateColumn()
    createdAt: Date

    @Index()
    @UpdateDateColumn()
    updatedAt: Date
}
