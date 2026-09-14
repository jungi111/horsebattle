import { defineConfig } from 'vite';

// GitHub Pages 는 /<repo>/ 하위 경로에서 서비스되므로 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  server: { port: 5173, strictPort: true, host: 'localhost' },
});
