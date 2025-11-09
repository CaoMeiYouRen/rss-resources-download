import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'

export default defineConfig([
    {
        ignores: [
            'dist/',
            'test/unit/coverage/',
            'test/unit/specs/',
            'build/',
            'node_modules/',
            '*.min.*',
            'src/public/',
            'public/',
        ],
    },
    cmyr,
    {
        rules: {
            'no-console': 'off',
        },
    },
])
