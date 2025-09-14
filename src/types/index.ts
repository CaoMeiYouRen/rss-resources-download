export interface Config {
    rssList: string[]
    dataPath?: string
    cookieCloudUrl?: string
    cookieCloudPassword?: string
    bduss: string
    stoken: string
    uploadPath: string
    rssLimit?: number
    uploadLimit?: number
    downloadLimit?: number
    cronTime?: string
    autoRemove?: boolean
    pushConfigs?: PushConfig[]
}

interface Stream {
    container: string
    quality: string
    src: string[][]
    size: number
}

interface Streams {
    [k: string]: Stream
}

interface Extra {
    referer: string
    ua: string
}

export interface VideoInfo {
    url: string
    title: string
    site: string
    streams: Streams
    extra: Extra
}

export interface PushConfig {
    type: string
    config: any
    option: any
}
