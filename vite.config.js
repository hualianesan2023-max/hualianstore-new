import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'
import path from 'path'

const localImagesDir = process.env.LOCAL_IMAGES_DIR || 'D:\\โปรแกรมคลัง\\Mydata\\images';

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

// Count files in directory
function countValidImages(dir) {
  try {
    if (!fs.existsSync(dir)) return 0;
    const files = fs.readdirSync(dir);
    return files.filter(f => /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(f)).length;
  } catch (e) {
    return 0;
  }
}

// Find image matching file across search directories
function resolveImage(searchDirs, rawFile) {
  if (!rawFile) return null;
  const cleanRaw = rawFile.replace(/^\/+/, '').split('?')[0];
  const baseName = path.basename(cleanRaw);
  const nameWithoutExt = baseName.replace(/\.[^.]+$/, '');
  const cleanAlpha = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '');

  const exts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
  const candidates = [
    baseName,
    nameWithoutExt,
    cleanAlpha,
    nameWithoutExt.toLowerCase(),
    cleanAlpha.toLowerCase(),
    nameWithoutExt.toUpperCase(),
    cleanAlpha.toUpperCase()
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const resolvedDir = path.resolve(dir);

    // 1. Exact match test
    for (const c of candidates) {
      const direct = path.resolve(resolvedDir, c);
      if (direct.startsWith(resolvedDir) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
        return direct;
      }
      // With extensions
      for (const ext of exts) {
        const withExt = path.resolve(resolvedDir, c + ext);
        if (withExt.startsWith(resolvedDir) && fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
          return withExt;
        }
      }
    }
  }

  return null;
}

const serveLocalImagesPlugin = () => ({
  name: 'serve-local-images',
  configureServer(server) {
    // 1. Status API: /api/local-images-status & /local-images-status
    const handleStatus = (req, res) => {
      const imagesCount = countValidImages(localImagesDir);
      const connected = imagesCount > 0;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        connected,
        imagesDir: localImagesDir,
        imagesExists: fs.existsSync(localImagesDir),
        imagesCount,
      }));
    };

    server.middlewares.use((req, res, next) => {
      const u = req.url ? req.url.split('?')[0] : '';
      if (u === '/api/local-images-status' || u === '/local-images-status') {
        return handleStatus(req, res);
      }
      next();
    });

    // 2. Serve Parts Images (/local-parts-images) -> looks in images directory
    server.middlewares.use('/local-parts-images', (req, res, next) => {
      try {
        const urlPath = req.url ? req.url.split('?')[0] : '';
        const rawFile = decodeURIComponent(urlPath.replace(/^\//, ''));
        const found = resolveImage([localImagesDir], rawFile);

        if (found) {
          const ext = path.extname(found).toLowerCase();
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return fs.createReadStream(found).pipe(res);
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
  plugins: [react(), viteSingleFile(), serveLocalImagesPlugin()],
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
