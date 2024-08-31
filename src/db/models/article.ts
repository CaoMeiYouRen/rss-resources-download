import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export class Article {

    @PrimaryGeneratedColumn()
    id: number

    @Column({
        length: 2048,
        nullable: true,
    })
    link: string

    @Column({
        length: 256,
        nullable: true,
    })
    title?: string

    @Index()
    @CreateDateColumn()
    createdAt: Date

    @Index()
    @UpdateDateColumn()
    updatedAt: Date
}
