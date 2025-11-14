import { parse, stringify } from 'smol-toml'

/**
 * 生成 yutto.toml 配置内容，用于后续调用 yutto 下载
 * @param config
 * @returns
 */
export function generateYuttoConfig(config: Record<string, any>): string {
    const newConfig: Record<string, any> = {
        basic: {
            dir: './data',
            tmp_dir: './data/tmp',
            vip_strict: true, // 是否启用 VIP 严格模式
            login_strict: true, // 是否启用登录严格模式
            danmaku_format: 'xml', // 弹幕格式 xml
        },
        resource: { require_subtitle: false },
        danmaku: { speed: 1 },
        batch: { with_section: false },
    }
    for (const key in config) {
        if (config[key] !== undefined) {
            newConfig[key] = config[key]
        }
    }
    return stringify(newConfig)
}

export function parseYuttoConfig(tomlString: string): Record<string, any> {
    return parse(tomlString)
}

