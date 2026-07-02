// Optional production build: bundles + minifies widget.js and copies static
// assets into dist/widget/. This is purely a convenience step — the widget
// also works directly from /widget as plain, unbundled files (no build required).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'widget');
const outDir = path.join(root, 'dist', 'widget');

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(srcDir, 'widget.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2019'],
  outfile: path.join(outDir, 'widget.min.js'),
});

fs.copyFileSync(path.join(srcDir, 'widget.css'), path.join(outDir, 'widget.css'));

const html = fs
  .readFileSync(path.join(srcDir, 'index.html'), 'utf8')
  .replace('./widget.js', './widget.min.js');
fs.writeFileSync(path.join(outDir, 'index.html'), html);

const assetsDir = path.join(srcDir, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.cpSync(assetsDir, path.join(outDir, 'assets'), { recursive: true });
}

console.log(`Build complete -> ${path.relative(root, outDir)}`);
console.log('Upload the contents of this folder to the CDN bucket (widgets-smartico/lootbox).');
