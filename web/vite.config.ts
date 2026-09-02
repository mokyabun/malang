import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.MALANG_API_TARGET || 'http://127.0.0.1:3000'

const config = defineConfig(({ command }) => ({
    resolve: { tsconfigPaths: true },
    server: {
        port: 5173,
        proxy: {
            '/api': apiTarget,
            '/health': apiTarget,
        },
        hmr: {
            overlay: true,
        },
    },
    plugins: [
        tailwindcss(),
        tanstackRouter({ target: 'react', autoCodeSplitting: command !== 'serve' }),
        viteReact(),
    ],
}))

export default config
