import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: {
    watch: {
      usePolling: true, // 开启轮询，专治 Docker/WSL 下热更新失效
    }
  },
  build: {
    assetsInlineLimit: 100000000,
  }
});