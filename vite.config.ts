import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Vendor code changes rarely; keep it in its own long-cached chunk.
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
});
