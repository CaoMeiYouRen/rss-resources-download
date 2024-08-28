export interface Config {
    rssList: string[]
    dataPath?: string
    pLimit?: number
    cookieCloudUrl?: string
    cookieCloudPassword?: string
    bduss: string
    uploadPath: string
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
