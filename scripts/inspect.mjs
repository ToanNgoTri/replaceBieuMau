/**
 * Soi chi tiết: xem một slot cụ thể đang bắt vào những chỗ nào.
 * Dùng: node scripts/inspect.mjs <thư mục> <slotId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fillDocx } from '../lib/docx/fill.js';
import { SAMPLE_PROFILE } from '../lib/profile.js';

const [dir, slotId] = process.argv.slice(2);
if (!dir || !slotId) {
  console.error('Dùng: node scripts/inspect.mjs <thư mục> <slotId>');
  process.exit(1);
}
for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.docx') && !f.startsWith('~'))) {
  const { hits } = fillDocx(fs.readFileSync(path.join(dir, name)), SAMPLE_PROFILE, { dryRun: true });
  for (const h of hits.filter((x) => x.slotId === slotId)) {
    console.log(`${name.slice(0, 34).padEnd(36)} ${h.before}`);
    console.log(`${''.padEnd(36)}  → ${h.after}`);
  }
}
