import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export default {
  root,
  server: {
    host: '127.0.0.1',
    port: 8080,
    hmr: {
      overlay: false,
    },
    fs: {
      allow: [root, path.resolve(root, '..')],
    },
  },
  optimizeDeps: {
    include: [
      'lucide-react',
      'react',
      'react-dom',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'tailwind-merge',
      'clsx',
    ],
  },
  plugins: [],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      '@tanstack/query-core',
    ],
  },
};
