// Optional production build: bundles + minifies every brand widget and copies
// the integration sandbox into dist/.
//
// Folder names are identical everywhere — repo, dist/ and CDN. That is what makes
// the sandbox's sibling iframe path (`../lootbox/index.html`) work locally, in
// dist/ and on the CDN without any environment detection.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const coreDir = path.join(root, 'core');
const testDir = path.join(root, 'lootbox-test');
const distDir = path.join(root, 'dist');

/**
 * Deploy map. `dir` is the folder name used in the repo, in dist/ and on the CDN
 * under widgets-smartico/ — keep the three in sync (see AGENTS.md).
 */
const BRANDS = [
  { id: 'vegas', dir: 'lootbox', label: 'Vegas Lootboxes' },
  { id: 'thor', dir: 'lootbox-thor', label: 'Thor Lootboxes' },
];

const STYLE_BLOCK = /<!-- lb:styles -->[\s\S]*?<!-- \/lb:styles -->/;

fs.rmSync(distDir, { recursive: true, force: true });

for (const brand of BRANDS) {
  const srcDir = path.join(root, brand.dir);
  const outDir = path.join(distDir, brand.dir);
  fs.mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(srcDir, 'widget.js')],
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2019'],
    outfile: path.join(outDir, 'widget.min.js'),
  });

  // One stylesheet per brand folder: shared fonts + shared structure + theme.
  // Font URLs stay `./assets/fonts/...`, which resolves because the fonts are
  // copied into this same folder below.
  const css = [
    path.join(coreDir, 'fonts.css'),
    path.join(coreDir, 'base.css'),
    path.join(srcDir, 'theme.css'),
  ]
    .map((file) => `/* ${path.relative(root, file)} */\n${fs.readFileSync(file, 'utf8')}`)
    .join('\n');
  fs.writeFileSync(path.join(outDir, 'widget.css'), css);

  const sourceHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  if (!STYLE_BLOCK.test(sourceHtml)) {
    throw new Error(`${brand.dir}/index.html is missing the <!-- lb:styles --> block`);
  }
  const html = sourceHtml
    .replace(STYLE_BLOCK, '<link rel="stylesheet" href="./widget.css" />')
    .replace('./widget.js', './widget.min.js');
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  const assetsDir = path.join(srcDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(outDir, 'assets'), { recursive: true });
  }
  // Shared fonts are duplicated per brand on purpose: a CDN folder must be
  // self-contained so it can be uploaded on its own (see AGENTS.md).
  fs.cpSync(path.join(coreDir, 'assets', 'fonts'), path.join(outDir, 'assets', 'fonts'), {
    recursive: true,
  });
}

// Integration sandbox — copied as-is; it loads each widget from its sibling folder.
fs.cpSync(testDir, path.join(distDir, 'lootbox-test'), { recursive: true });

console.log('Build complete -> dist/');
for (const brand of BRANDS) {
  console.log(
    `  ${brand.label.padEnd(20)} dist/${brand.dir}/`.padEnd(52) +
      `-> CDN widgets-smartico/${brand.dir}/`,
  );
}
console.log('  Test page'.padEnd(22) + 'dist/lootbox-test/'.padEnd(30) + '-> CDN widgets-smartico/lootbox-test/');
console.log('');
console.log('Local preview: npm run serve:dist');
console.log('  http://localhost:4173/lootbox-test/index.html');
for (const brand of BRANDS) {
  console.log(`  http://localhost:4173/${brand.dir}/index.html`);
}
