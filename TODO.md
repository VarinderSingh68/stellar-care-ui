# Performance Optimization TODO

## Approved Plan Steps

### 1. Create/Update TODO.md ✅
### 2. Optimize vite.config.ts ✅
   - Added sourcemap:false for dev
   - componentTagger now only if TAG=true
   - Added optimizeDeps.include (lucide, radix, etc.)
   - Added build.rollupOptions manualChunks + sourcemap:false
### 3. Fix tailwind.config.ts content paths ✅
   - Content already correct: `./src/**/*.{ts,tsx}`
### 4. Update package.json scripts ✅
   - Added `dev:fast` (disables componentTagger), `serve:dist`, `cache:clean`
### 5. Demo icon optimization (Optional)
### 6. Test & cleanup (Next)
   - Time dev startup/build
   - Update TODO with results
   - attempt_completion

**Next: Step 3**

Current progress: vite.config.ts optimized, dependencies reinstalling.
