import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry:   resolve(__dirname, 'src/index.ts'),
      name:    'JsTree',
      formats: ['es', 'umd'],
      fileName: (format) => format === 'umd'
        ? 'jstree.umd.cjs'
        : `jstree.${format}.js`,
    },
    target:       'es2020',
    outDir:       'dist',
    sourcemap:    true,
    cssCodeSplit: false,
    emptyOutDir:  true,
  },
});
