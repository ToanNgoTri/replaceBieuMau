/**
 * Chuyển các bảng kết xuất dân cư thành CSV / JSON nhập thẳng vào bảng
 * `population` trên Supabase.
 *
 * Dùng:
 *   node scripts/convert.mjs <thư mục tải về | các file> <thư mục đích> [tuỳ chọn]
 *
 * Tuỳ chọn:
 *   --don-vi "Hàng Gòn"   tên đơn vị cấp xã, dùng để cắt đuôi địa chỉ
 *   --kinh                ai không có trong file dân tộc thì ghi KINH
 *   --chia 5000           cắt file kết quả thành nhiều mẻ, mỗi mẻ bấy nhiêu dòng
 *   --khong-doi-ngay      giữ nguyên ngày trong .ods (xem lib/sheet/ods.js)
 *
 * Định dạng xuất — mặc định CSV:
 *   --json                xuất population.json thay vì .csv
 *   --ca-hai              xuất cả .csv lẫn .json
 *
 * Chỉ định vai khi bản kết xuất đặt tên/nhãn khác, máy đoán không ra:
 *   --nk <file>   bảng nhân khẩu      --dt <file>   bảng dân tộc
 *   --hk <file>   bảng hộ khẩu        --tg <file>   bảng tôn giáo
 *   --xoa <file>  bảng nhân khẩu đã xoá (cùng dạng bảng nhân khẩu → DELETED = true)
 *   (gõ cả đường dẫn hoặc chỉ một mẩu tên file, miễn là không lẫn với file khác)
 *
 * Ví dụ:
 *   node scripts/convert.mjs ~/Downloads ./ket-qua-dancu --kinh
 *   node scripts/convert.mjs ~/Downloads ./ket-qua-dancu --nk "DS cong dan.ods" --dt loc-dt.xlsx
 *
 * Ngại gõ dòng lệnh thì `npm run ui` có giao diện làm đúng việc này.
 */
import path from 'node:path';
import { banBaoCao } from '../lib/population/baocao.js';
import { chayChuyenDoi, quetNguon } from '../lib/population/chay.js';
import { CAC_VAI, VIET_TAT, tenVai } from '../lib/population/nguon.js';

const CACH_DUNG =
  'Dùng: node scripts/convert.mjs <thư mục tải về | các file> <thư mục đích> ' +
  '[--don-vi "Hàng Gòn"] [--kinh] [--chia 5000] [--khong-doi-ngay] [--json | --ca-hai] ' +
  '[--nk file] [--hk file] [--dt file] [--tg file] [--xoa file]';

const argv = process.argv.slice(2);
const co = (ten) => argv.includes(ten);
const layGiaTri = (ten, macDinh) => {
  const i = argv.indexOf(ten);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : macDinh;
};

/** Mọi cờ có kèm giá trị — dùng để loại giá trị đó ra khỏi danh sách đường dẫn. */
const CO_CO_GIA_TRI = new Set(['--don-vi', '--chia', ...Object.keys(VIET_TAT).map((k) => `--${k}`)]);

const viTri = argv.filter((a, i) => !a.startsWith('--') && !CO_CO_GIA_TRI.has(argv[i - 1]));

if (viTri.length < 2) {
  console.error(CACH_DUNG);
  process.exit(1);
}

const nguon = viTri.slice(0, -1);
const outDir = viTri[viTri.length - 1];
const donVi = layGiaTri('--don-vi', 'Hàng Gòn');
const macDinhKinh = co('--kinh');
const doiNgayThang = !co('--khong-doi-ngay');
const chia = +layGiaTri('--chia', 0) || 0;
const dinhDang = co('--ca-hai') ? 'caHai' : co('--json') ? 'json' : 'csv';

const chiDinh = {};
for (const tat of Object.keys(VIET_TAT)) {
  const v = layGiaTri(`--${tat}`, '');
  if (v) chiDinh[tat] = v;
}

let quet;
try {
  quet = quetNguon(nguon, { chiDinh, doiNgayThang });
} catch (loi) {
  console.error(loi.message);
  process.exit(1);
}

if (!quet.daNgo.length) {
  console.error('Không tìm thấy file .ods hoặc .xlsx nào.\n' + CACH_DUNG);
  process.exit(1);
}

/** Vai cuối cùng của một file — theo chỉ định tay nếu có, không thì theo nhận dạng. */
const vaiDaChon = new Map();
for (const vai of CAC_VAI) {
  if (quet.chon[vai]) vaiDaChon.set(path.resolve(quet.chon[vai]), vai);
}

console.log('Nhận dạng:');
for (const n of [...quet.daNgo].sort((a, b) => (b.vai ? 1 : 0) - (a.vai ? 1 : 0))) {
  const dung = vaiDaChon.get(path.resolve(n.file));
  const nhan = dung ? tenVai(dung) : '(bỏ qua)';
  const boi = dung && quet.boi[dung] !== 'nội dung' ? ` ← ${quet.boi[dung]}` : '';
  console.log(`  ${nhan.padEnd(16)} ${n.ten.padEnd(46)} ${n.dauHieu}${boi}`);
}

for (const g of quet.ghiChu) console.log(`\n  ${g}`);

if (quet.loi.length) {
  console.error('\n' + quet.loi.join('\n'));
  process.exit(1);
}

let kq;
try {
  kq = chayChuyenDoi({ chon: quet.chon, outDir, donVi, macDinhKinh, chia, doiNgayThang, dinhDang });
} catch (loi) {
  // Gần như luôn là "file này không phải bảng như đã gán" — người dùng cần đọc
  // được câu đó, không phải một vệt stack trace.
  console.error('\n' + loi.message);
  process.exit(1);
}

console.log(banBaoCao(kq, { doiNgayThang }));
