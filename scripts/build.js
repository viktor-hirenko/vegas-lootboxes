// Optional production build: bundles + minifies the widget and copies the
// integration sandbox into dist/. Folder names are identical everywhere —
// repo, dist/ and CDN all use `lootbox/` and `lootbox-test/`.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'lootbox');
const testDir = path.join(root, 'lootbox-test');
const distDir = path.join(root, 'dist');
const widgetOutDir = path.join(distDir, 'lootbox');
const testOutDir = path.join(distDir, 'lootbox-test');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(widgetOutDir, { recursive: true });
fs.mkdirSync(testOutDir, { recursive: true });

await build({
  entryPoints: [path.join(srcDir, 'widget.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2019'],
  outfile: path.join(widgetOutDir, 'widget.min.js'),
});

fs.copyFileSync(path.join(srcDir, 'widget.css'), path.join(widgetOutDir, 'widget.css'));

const widgetHtml = fs
  .readFileSync(path.join(srcDir, 'index.html'), 'utf8')
  .replace('./widget.js', './widget.min.js');
fs.writeFileSync(path.join(widgetOutDir, 'index.html'), widgetHtml);

const assetsDir = path.join(srcDir, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.cpSync(assetsDir, path.join(widgetOutDir, 'assets'), { recursive: true });
}

// Integration sandbox — copied as-is; it loads the widget from ../lootbox/.
fs.cpSync(testDir, testOutDir, { recursive: true });

console.log('Build complete -> dist/');
console.log('  Widget:    dist/lootbox/      -> CDN widgets-smartico/lootbox/');
console.log('  Test page: dist/lootbox-test/ -> CDN widgets-smartico/lootbox-test/');
console.log('');
console.log('Local preview: npm run serve:dist');
console.log('  http://localhost:4173/lootbox-test/index.html');
console.log('  http://localhost:4173/lootbox/index.html');
