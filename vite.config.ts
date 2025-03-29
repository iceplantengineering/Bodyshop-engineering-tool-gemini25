import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'; // url モジュールから fileURLToPath をインポート

const __filename = fileURLToPath(import.meta.url); // 現在のファイルのパスを取得
const __dirname = path.dirname(__filename); // ディレクトリ名を取得

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // エイリアスを設定
    },
  },
})