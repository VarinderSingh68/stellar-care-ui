import path from 'path';

export default {
  sourcemap: false,
  server: {
    host: '::',
    port: 8080,
    hmr: {
      overlay: false,
    },
    fs: {
      allow: ['..']
    }
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
