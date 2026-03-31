import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distHtmlPath = path.join(rootDir, 'dist', 'index.html');
const gasDir = path.join(rootDir, 'gas');
const gasHtmlPath = path.join(gasDir, 'Index.html');

const rawHtml = await readFile(distHtmlPath, 'utf8');
const htmlWithBase = rawHtml.includes('<base target="_top">') || rawHtml.includes('<base target="_top"')
  ? rawHtml
  : rawHtml.replace('<head>', '<head>\n    <base target="_top">');

await mkdir(gasDir, { recursive: true });
await writeFile(gasHtmlPath, htmlWithBase, 'utf8');

console.log(`Wrote GAS HTML to ${path.relative(rootDir, gasHtmlPath)}`);
