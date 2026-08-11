/**
 * Quét một thư mục biểu mẫu .docx và báo cáo:
 *   1. Mỗi slot bắt được bao nhiêu chỗ, ở bao nhiêu file
 *   2. File nào không bắt được gì (nghi thiếu khai báo)
 *   3. Các đoạn còn ô trống mang tính ngữ cảnh nhưng chưa slot nào nhận
 *
 * Dùng: node scripts/scan.mjs "<thư mục>" [--misses]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fillDocx } from '../lib/docx/fill.js';
import { SAMPLE_PROFILE } from '../lib/profile.js';
import { SLOTS } from '../lib/slots/definitions.js';

const dir = process.argv[2];
const showMisses = process.argv.includes('--misses');
if (!dir) {
  console.error('Thiếu tham số: node scripts/scan.mjs "<thư mục chứa .docx>"');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~'));

const bySlot = new Map();
const emptyFiles = [];
const missLines = new Map();
const failures = [];
let totalHits = 0;

for (const name of files) {
  let result;
  try {
    result = fillDocx(fs.readFileSync(path.join(dir, name)), SAMPLE_PROFILE, { dryRun: true });
  } catch (err) {
    failures.push(`${name} — ${err.message}`);
    continue;
  }

  totalHits += result.hits.length;
  const seen = new Set();
  for (const h of result.hits) {
    const rec = bySlot.get(h.slotId) ?? { hits: 0, files: new Set(), sample: h };
    rec.hits++;
    rec.files.add(name);
    bySlot.set(h.slotId, rec);
    seen.add(h.slotId);
  }
  if (result.hits.length === 0) emptyFiles.push(name);

  for (const m of result.misses) {
    const key = m.text.replace(/[.…]{2,}/gu, '…').slice(0, 110);
    const rec = missLines.get(key) ?? { count: 0, files: new Set() };
    rec.count++;
    rec.files.add(name);
    missLines.set(key, rec);
  }
}

const pad = (s, n) => String(s).padEnd(n);

console.log(`\n═══ QUÉT ${files.length} BIỂU MẪU ═══\n`);
console.log(`Tổng số ô điền được: ${totalHits}\n`);

const PACK_LABEL = {
  'cong-dan': 'TOKEN CÔNG DÂN  (chèn {TÊN}, bôi vàng — để ppv2web điền sau)',
  'cong-an': 'Ô ĐƠN VỊ / NGỮ CẢNH  (điền từ hồ sơ đơn vị)',
};

for (const pack of [...new Set(SLOTS.map((s) => s.pack))]) {
  const inPack = SLOTS.filter((s) => s.pack === pack);
  const total = inPack.reduce((n, s) => n + (bySlot.get(s.id)?.hits ?? 0), 0);
  console.log(`┌─ ${PACK_LABEL[pack] ?? pack} — ${total} ô`);
  for (const slot of inPack) {
    const rec = bySlot.get(slot.id);
    const hits = rec ? rec.hits : 0;
    const nf = rec ? rec.files.size : 0;
    const bar = '█'.repeat(Math.min(26, Math.round((nf / Math.max(1, files.length)) * 26)));
    const off = slot.default === false ? ' (tắt sẵn)' : '';
    console.log(
      `│ ${pad(slot.id, 16)} ${pad(hits + ' ô', 8)} ${pad(nf + '/' + files.length, 8)} ${bar}${off}`,
    );
  }
  console.log('└────────────────────────────────────────────────────────────────────\n');
}

if (failures.length) {
  console.log(`⚠ ${failures.length} FILE LỖI:`);
  failures.forEach((f) => console.log('  ' + f));
  console.log();
}

if (emptyFiles.length) {
  console.log(`⚠ ${emptyFiles.length} FILE KHÔNG BẮT ĐƯỢC Ô NÀO:`);
  emptyFiles.slice(0, 20).forEach((f) => console.log('  ' + f));
  if (emptyFiles.length > 20) console.log(`  ... và ${emptyFiles.length - 20} file nữa`);
  console.log();
}

const misses = [...missLines.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`── ĐOẠN NGHI THIẾU KHAI BÁO: ${misses.length} kiểu ──`);
if (showMisses) {
  misses.slice(0, 40).forEach(([text, rec]) => console.log(`  [${rec.count}×] ${text}`));
} else {
  misses.slice(0, 12).forEach(([text, rec]) => console.log(`  [${rec.count}×] ${text}`));
  if (misses.length > 12) console.log(`  ... chạy lại với --misses để xem đủ`);
}
console.log();
