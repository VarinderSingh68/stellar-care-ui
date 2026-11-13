import path from 'path';
import dotenv from 'dotenv';

// Local development reads VITE_* variables from env/frontend.env at the repo
// root. Vite picks up VITE_* keys from process.env, and dotenv never
// overrides variables that are already set, so a build without that file
// (CI / InfinityFree) simply has no VITE_API_URL and the app falls back to its
// own origin.
dotenv.config({ path: path.resolve(__dirname, '..', 'env', 'frontend.env') });

export default {
  sourcemap: false,
  server: {
    host: '::',
    port: 8080,
    hmr: {
      overlay: false,
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
      'clsx'
    ]
  },
  plugins: [],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-query', '@tanstack/query-core'],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
};
