/**
 * Điền hồ sơ đơn vị vào một file hoặc cả thư mục biểu mẫu.
 *
 * Dùng:
 *   node scripts/fill.mjs <nguồn.docx|thư mục> <thư mục đích> [hồ-sơ.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fillDocx } from '../lib/docx/fill.js';
import { SAMPLE_PROFILE, validate } from '../lib/profile.js';

const [src, outDir, profilePath] = process.argv.slice(2);
if (!src || !outDir) {
  console.error('Dùng: node scripts/fill.mjs <nguồn.docx|thư mục> <thư mục đích> [hồ-sơ.json]');
  process.exit(1);
}

const profile = profilePath
  ? JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  : SAMPLE_PROFILE;

const missing = validate(profile);
if (missing.length) {
  console.error('Hồ sơ đơn vị thiếu trường bắt buộc: ' + missing.join(', '));
  process.exit(1);
}

const stat = fs.statSync(src);
const files = stat.isDirectory()
  ? fs.readdirSync(src).filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~'))
  : [path.basename(src)];
const baseDir = stat.isDirectory() ? src : path.dirname(src);

fs.mkdirSync(outDir, { recursive: true });

let totalHits = 0;
for (const name of files) {
  const result = fillDocx(fs.readFileSync(path.join(baseDir, name)), profile);
  fs.writeFileSync(path.join(outDir, name), result.buffer);
  totalHits += result.hits.length;

  if (files.length === 1) {
    console.log(`\n${name} — điền ${result.hits.length} ô:\n`);
    for (const h of result.hits) {
      console.log(`  [${h.slotId}]`);
      console.log(`     trước: ${h.before}`);
      console.log(`     sau  : ${h.after}\n`);
    }
  } else {
    console.log(`${String(result.hits.length).padStart(3)} ô  ${name}`);
  }
}

console.log(`\nXong: ${files.length} file, ${totalHits} ô đã điền → ${outDir}`);
