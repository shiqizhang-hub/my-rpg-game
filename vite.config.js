import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    watch: {
      usePolling: true,
    }
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        user: 'user.html',
        admin: 'admin.html',
      }
    }
  }
});