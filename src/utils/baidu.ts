import { $ } from 'zx'

/**
 * 使用 bduss 登录百度网盘
 *
 * @author CaoMeiYouRen
 * @date 2022-09-18
 * @param bduss
 */
async function loginByBduss(bduss: string) {
    const flags = [
        `-bduss=${bduss}`,
    ]
    return $`BaiduPCS-Go login ${flags}`
}

/**
 * 获取当前帐号
 *
 * @author CaoMeiYouRen
 * @date 2022-09-18
 */
async function who() {
    return $`BaiduPCS-Go who`
}

/**
 *
 * 上传本地文件到百度网盘
 * @author CaoMeiYouRen
 * @date 2022-09-18
 * @param from
 * @param to
 */
async function upload(from: string, to: string) {
    const flags = [
        from,
        to,
    ]
    return $`BaiduPCS-Go upload ${flags}`
}

/**
 * 移动、重命名文件路径
 *
 * @author CaoMeiYouRen
 * @date 2022-09-18
 * @param from
 * @param to
 */
async function move(from: string, to: string) {
    const flags = [
        from,
        to,
    ]
    return $`BaiduPCS-Go mv ${flags}`
}

/**
 * 删除文件/目录
 *
 * @author CaoMeiYouRen
 * @date 2024-03-23
 * @param from
 */
async function remove(from: string) {
    const flags = [
        from,
    ]
    return $`BaiduPCS-Go rm ${flags}`
}

export const BaiduPCS = {
    loginByBduss,
    upload,
    move,
    who,
    remove,
}
