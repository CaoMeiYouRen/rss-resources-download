import { describe, expect, it } from 'vitest'
import {
    escapeYuttoTemplate,
    generateYuttoConfig,
    isBilibiliUrl,
    parseCookieFile,
    parseYuttoConfig,
} from './yutto'

describe('isBilibiliUrl', () => {
    it('识别 B 站链接', () => {
        expect(isBilibiliUrl('https://www.bilibili.com/video/av117540671982699?p=1')).toBe(true)
        expect(isBilibiliUrl('https://b23.tv/abc123')).toBe(true)
        expect(isBilibiliUrl('https://www.youtube.com/watch?v=xxx')).toBe(false)
        expect(isBilibiliUrl('not a url')).toBe(false)
    })
})

describe('escapeYuttoTemplate', () => {
    it('转义文件名中的花括号，避免被当作模板变量', () => {
        expect(escapeYuttoTemplate('视频_{name}_{av123}')).toBe('视频_{{name}}_{{av123}}')
    })
})

describe('generateYuttoConfig', () => {
    it('将 sessdata 写入 basic，并保留默认配置', () => {
        const config = parseYuttoConfig(generateYuttoConfig({ basic: { sessdata: 'test-sessdata' } }))
        expect(config.basic.sessdata).toBe('test-sessdata')
        expect(config.basic.subpath_template).toBe('{name}')
        expect(config.basic.vip_strict).toBe(false)
        expect(config.basic.login_strict).toBe(false)
        expect(config.resource.require_subtitle).toBe(false)
    })
})

describe('parseCookieFile', () => {
    it('解析 Netscape 格式的 cookie 文件', () => {
        const content = [
            '# Netscape HTTP Cookie File',
            '.bilibili.com\tTRUE\t/\tFALSE\t0\tSESSDATA\tsess-value',
            '.bilibili.com\tTRUE\t/\tFALSE\t0\tbili_jct\tjct-value',
        ].join('\n')
        const cookies = parseCookieFile(content)
        expect(cookies.get('SESSDATA')).toBe('sess-value')
        expect(cookies.get('bili_jct')).toBe('jct-value')
    })

    it('解析 Cookie 请求头格式', () => {
        const cookies = parseCookieFile('SESSDATA=sess-value; bili_jct=jct-value')
        expect(cookies.get('SESSDATA')).toBe('sess-value')
        expect(cookies.get('bili_jct')).toBe('jct-value')
    })

    it('解析浏览器导出的 HttpOnly cookie', () => {
        const content = '#HttpOnly_.bilibili.com\tTRUE\t/\tTRUE\t0\tSESSDATA\tsess-value'
        expect(parseCookieFile(content).get('SESSDATA')).toBe('sess-value')
    })
})
