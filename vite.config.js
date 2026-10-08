import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'
import path from 'path'

const localImagesDir = 'D:\\โปรแกรมคลัง\\Mydata\\images';

const serveLocalPartsImagesPlugin = () => ({
  name: 'serve-local-parts-images',
  configureServer(server) {
    server.middlewares.use('/local-parts-images', (req, res, next) => {
      try {
        const urlPath = req.url ? req.url.split('?')[0] : '';
        const rawFile = decodeURIComponent(urlPath.replace(/^\//, ''));
        if (!rawFile) {
          res.statusCode = 404;
          return res.end('Not found');
        }

        const resolvedBase = path.resolve(localImagesDir);
        let targetFile = path.resolve(localImagesDir, rawFile);

        // Security check: prevent directory traversal
        if (!targetFile.startsWith(resolvedBase)) {
          res.statusCode = 403;
          return res.end('Forbidden');
        }

        // Check if file exists, or try adding extensions
        let foundPath = null;
        if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
          foundPath = targetFile;
        } else {
          for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']) {
            const tryPath = targetFile + ext;
            if (fs.existsSync(tryPath) && fs.statSync(tryPath).isFile()) {
              foundPath = tryPath;
              break;
            }
          }
        }

        if (foundPath) {
          const ext = path.extname(foundPath).toLowerCase();
          const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
          };
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return fs.createReadStream(foundPath).pipe(res);
        }

        res.statusCode = 404;
        res.end('File not found');
      } catch (err) {
        console.error('Error serving local part image:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile(), serveLocalPartsImagesPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
