export interface Config {
    rssList: string[]
    dataPath?: string
    cookieCloudUrl?: string
    cookieCloudPassword?: string
    bduss: string
    uploadPath: string
    uploadLimit?: number
    downloadLimit?: number
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
