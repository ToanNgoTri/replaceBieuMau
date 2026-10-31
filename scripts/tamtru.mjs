/**
 * Chuyển bảng kết xuất tạm trú thành CSV / JSON nhập thẳng vào bảng `tamtru`
 * trên Supabase (cùng lược đồ với `population`, thêm cột NGAYDEN).
 *
 * Dùng:
 *   node scripts/tamtru.mjs <file tạm trú .xlsx|.ods> <thư mục đích> [tuỳ chọn]
 *
 * Tuỳ chọn:
 *   --don-vi "Hàng Gòn"   tên đơn vị cấp xã, dùng để cắt đuôi nơi tạm trú
 *   --json                xuất tamtru.json thay vì .csv
 *   --ca-hai              xuất cả .csv lẫn .json
 *
 * Ví dụ:
 *   node scripts/tamtru.mjs import/TAMTRU.xlsx export/ket-qua-tamtru
 */
import fs from 'node:fs';
import path from 'node:path';
import { docBang } from '../lib/population/nguon.js';
import { taoCsv } from '../lib/population/csv.js';
import { taoJson } from '../lib/population/json.js';
import { chuyenDoiTamTru, COT_TAMTRU } from '../lib/population/tamtru.js';

const argv = process.argv.slice(2);
const co = (ten) => argv.includes(ten);
const layGiaTri = (ten, macDinh) => {
  const i = argv.indexOf(ten);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : macDinh;
};
const viTri = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--don-vi');

if (viTri.length !== 2) {
  console.error('Dùng: node scripts/tamtru.mjs <file tạm trú> <thư mục đích> [--don-vi "Hàng Gòn"] [--json | --ca-hai]');
  process.exit(1);
}

const [file, outDir] = viTri;
const donVi = layGiaTri('--don-vi', 'Hàng Gòn');
const boXuat = co('--ca-hai')
  ? [['csv', taoCsv], ['json', taoJson]]
  : co('--json')
    ? [['json', taoJson]]
    : [['csv', taoCsv]];

let kq;
try {
  kq = chuyenDoiTamTru(docBang(file), { donVi });
} catch (loi) {
  console.error(loi.message);
  process.exit(1);
}
const { banGhi, canhBao, thongKe: t } = kq;

fs.mkdirSync(outDir, { recursive: true });
const daGhi = [];
for (const [duoi, ra] of boXuat) {
  fs.writeFileSync(path.join(outDir, `tamtru.${duoi}`), ra(banGhi, COT_TAMTRU), 'utf8');
  daGhi.push(`tamtru.${duoi} (${banGhi.length} dòng)`);
  if (canhBao.length) {
    fs.writeFileSync(path.join(outDir, `canh-bao-tamtru.${duoi}`), ra(canhBao, ['dong', 'cccd', 'hoTen', 'lyDo']), 'utf8');
    daGhi.push(`canh-bao-tamtru.${duoi} (${canhBao.length} dòng)`);
  }
}

console.log(`Đọc ${t.hangDoc} dòng → ${banGhi.length} người tạm trú`);
if (t.dangKyCu) console.log(`  ${t.dangKyCu} dòng là lần đăng ký cũ của cùng CCCD — giữ lần có ngày đến mới nhất`);
if (t.thieuCccd) console.log(`  ${t.thieuCccd} dòng không có CCCD — bỏ qua`);
if (t.khongNgaySinh) console.log(`  ${t.khongNgaySinh} người không đọc được ngày sinh`);
if (t.khongGioiTinh) console.log(`  ${t.khongGioiTinh} người không đọc được giới tính`);
console.log(
  `Hộ: ${t.soHo} — ${t.hoCoChuHo} hộ có chủ hộ trong danh sách, ` +
    `${t.hoVangChuHo} hộ vắng chủ hộ, ${t.oMotMinh} người không ghi chủ hộ (mỗi người một hộ)`,
);
console.log(`\nĐã ghi vào ${path.resolve(outDir)}:\n  ${daGhi.join('\n  ')}`);
