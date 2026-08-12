/**
 * Chuyển ba bảng kết xuất dân cư thành CSV nhập thẳng vào bảng `population`
 * trên Supabase.
 *
 * Dùng:
 *   node scripts/convert.mjs <thư mục tải về | các file> <thư mục đích> [tuỳ chọn]
 *
 * Tuỳ chọn:
 *   --don-vi "Hàng Gòn"   tên đơn vị cấp xã, dùng để cắt đuôi địa chỉ
 *   --kinh                ai không có trong file dân tộc thì ghi KINH
 *   --chia 5000           cắt CSV thành nhiều file, mỗi file bấy nhiêu dòng
 *   --khong-doi-ngay      giữ nguyên ngày trong .ods (xem lib/sheet/ods.js)
 *
 * Ví dụ:
 *   node scripts/convert.mjs ~/Downloads ./ket-qua-dancu --kinh
 */
import fs from 'node:fs';
import path from 'node:path';
import { docOds } from '../lib/sheet/ods.js';
import { docXlsx } from '../lib/sheet/xlsx.js';
import { chuyenDoi, COT_POPULATION } from '../lib/population/convert.js';
import { chiaMe, taoCsv } from '../lib/population/csv.js';
import { khongDau } from '../lib/population/fields.js';
import { nhanDang, tenVai } from '../lib/population/nhandang.js';

const CACH_DUNG =
  'Dùng: node scripts/convert.mjs <thư mục tải về | các file> <thư mục đích> ' +
  '[--don-vi "Hàng Gòn"] [--kinh] [--chia 5000] [--khong-doi-ngay]';

const argv = process.argv.slice(2);
const co = (ten) => argv.includes(ten);
const layGiaTri = (ten, macDinh) => {
  const i = argv.indexOf(ten);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : macDinh;
};

const viTri = argv.filter((a, i) => {
  if (a.startsWith('--')) return false;
  const truoc = argv[i - 1];
  return !(truoc === '--don-vi' || truoc === '--chia');
});

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

/**
 * Gom danh sách file bảng tính từ các đường dẫn truyền vào.
 */
function gomFile(duongDan) {
  const out = [];
  for (const p of duongDan) {
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        if (/\.(ods|xlsx)$/i.test(f) && !f.startsWith('~') && !f.startsWith('.')) {
          out.push(path.join(p, f));
        }
      }
    } else {
      out.push(p);
    }
  }
  return out;
}

const thongKeNgay = {};

function doc(file, { laNhanKhau = false, gioiHan = 0 } = {}) {
  const buf = fs.readFileSync(file);
  if (/\.ods$/i.test(file)) {
    return docOds(buf, { doiNgayThang, thongKe: laNhanKhau ? thongKeNgay : {}, gioiHan });
  }
  return docXlsx(buf, { gioiHan });
}

const files = gomFile(nguon);
if (!files.length) {
  console.error('Không tìm thấy file .ods hoặc .xlsx nào.\n' + CACH_DUNG);
  process.exit(1);
}

/**
 * Nhận dạng từng file bằng NỘI DUNG, không bằng tên.
 *
 * Chỉ đọc vài trăm hàng đầu cho nhanh — đủ để thấy tiêu đề và nếm thử cột giá
 * trị. File nào không phải bảng dân cư thì bỏ qua kèm lý do, vì thư mục Tải về
 * thường còn hàng chục bảng tính khác không liên quan.
 */
const NGO_SO_HANG = 400;
const daNgo = [];
for (const file of files) {
  try {
    const mau = doc(file, { gioiHan: NGO_SO_HANG });
    daNgo.push({ file, ...nhanDang(mau) });
  } catch (loi) {
    daNgo.push({ file, vai: '', dauHieu: `không đọc được: ${loi.message}` });
  }
}

console.log('Nhận dạng theo nội dung:');
for (const n of daNgo.sort((a, b) => (b.vai ? 1 : 0) - (a.vai ? 1 : 0))) {
  const nhan = n.vai ? tenVai(n.vai) : '(bỏ qua)';
  console.log(`  ${nhan.padEnd(10)} ${path.basename(n.file).padEnd(46)} ${n.dauHieu}`);
}

/** Hai file cùng nhận một vai thì lấy file có từ khoá trong tên, không thì báo lỗi. */
function chonMotFile(vai, ds) {
  if (ds.length <= 1) return ds[0]?.file ?? null;
  const tuKhoa = { nhanKhau: 'nhankhau', hoKhau: 'hokhau', danToc: 'dantoc', tonGiao: 'tongiao' }[vai];
  const theoTen = ds.filter((n) =>
    khongDau(path.basename(n.file)).toLowerCase().replace(/[^a-z0-9]/g, '').includes(tuKhoa),
  );
  if (theoTen.length === 1) {
    console.log(`\n  ${ds.length} file cùng là bảng ${tenVai(vai)}, chọn theo tên: ${path.basename(theoTen[0].file)}`);
    return theoTen[0].file;
  }
  console.error(
    `\nCó ${ds.length} file cùng là bảng ${tenVai(vai)}:\n  ` +
      ds.map((n) => path.basename(n.file)).join('\n  ') +
      '\nChỉ tên thẳng file cần dùng để khỏi lẫn.',
  );
  process.exit(1);
}

const chon = {};
for (const vai of ['nhanKhau', 'danToc', 'tonGiao', 'hoKhau']) {
  chon[vai] = chonMotFile(vai, daNgo.filter((n) => n.vai === vai));
}

if (!chon.nhanKhau) {
  console.error(
    '\nKhông có file nào là bảng nhân khẩu. Bảng nhân khẩu là bảng có đủ cột ' +
      '"Họ và tên", "Họ tên cha", "Họ tên mẹ" và không có cột dân tộc/tôn giáo kèm theo.',
  );
  process.exit(1);
}

const nguonBang = {
  nhanKhau: doc(chon.nhanKhau, { laNhanKhau: true }),
  danToc: chon.danToc ? doc(chon.danToc) : null,
  tonGiao: chon.tonGiao ? doc(chon.tonGiao) : null,
  hoKhau: chon.hoKhau ? doc(chon.hoKhau) : null,
};

const { banGhi, canhBao, thongKe } = chuyenDoi(nguonBang, { donVi, macDinhKinh });

fs.mkdirSync(outDir, { recursive: true });
const me = chiaMe(banGhi, chia);
const tenFile = [];
for (const [i, phan] of me.entries()) {
  const ten = me.length === 1 ? 'population.csv' : `population-${String(i + 1).padStart(2, '0')}.csv`;
  fs.writeFileSync(path.join(outDir, ten), taoCsv(phan, COT_POPULATION), 'utf8');
  tenFile.push(`${ten} (${phan.length} dòng)`);
}

if (canhBao.length) {
  const csv = taoCsv(canhBao, ['dong', 'cccd', 'hoTen', 'lyDo']);
  fs.writeFileSync(path.join(outDir, 'canh-bao.csv'), csv, 'utf8');
}

const so = (n) => String(n).padStart(6);

/** Bảng đếm quan hệ, xếp nhiều trước, hai cột cho gọn màn hình. */
function bangQuanHe({ quanHe }) {
  const muc = Object.entries(quanHe)
    .sort((a, b) => b[1] - a[1])
    .map(([ten, n]) => `${so(n)} ${ten}`);
  const dong = [];
  for (let i = 0; i < muc.length; i += 2) {
    dong.push('  ' + muc[i].padEnd(24) + (muc[i + 1] ?? ''));
  }
  return dong.join('\n');
}
console.log(`
Nguồn
  ${so(thongKe.hangDoc)} dòng dữ liệu (${thongKe.hangTieuDeLap} hàng tiêu đề lặp đã bỏ)
  ${so(thongKe.thieuCccd)} dòng không có CCCD — bỏ, vì CCCD là khoá chính
  ${so(thongKe.trungCccd)} dòng trùng CCCD — giữ dòng đầu

Ghép thêm
  ${so(thongKe.coDanToc)} người có dân tộc${thongKe.macDinhKinh ? `, ${thongKe.macDinhKinh} người mặc định KINH` : ''}
  ${so(thongKe.coTonGiao)} người có tôn giáo
  ${so(thongKe.danTocThua ?? 0)} + ${thongKe.tonGiaoThua ?? 0} người ở file lọc không thấy trong bảng nhân khẩu

Quan hệ với chủ hộ — suy từ tên cha mẹ trong ${thongKe.soHo} hộ
${bangQuanHe(thongKe)}
  ${so(banGhi.length - Object.values(thongKe.quanHe).reduce((a, b) => a + b, 0))} để trống (không đủ căn cứ suy ra)
  ${so(thongKe.hoTheoHoKhau)} hộ xác định chủ hộ bằng CCCD trong file hộ khẩu
  ${so(thongKe.hoTheoTen)} hộ dò chủ hộ theo tên
  ${so(thongKe.hoChuHoVang)} hộ chủ hộ đã đi khỏi hộ — vẫn suy được vợ/con của người đó
  ${so(thongKe.hoKhongBietChuHo)} hộ không xác định được chủ hộ${
    thongKe.khongSoHo ? `, ${thongKe.khongSoHo} người không có số hộ` : ''
  }
${
  doiNgayThang && thongKeNgay.oNgayDaDoi
    ? `\nSửa lỗi LibreOffice\n  ${so(thongKeNgay.oNgayDaDoi)} ô kiểu ngày đã đảo lại ngày ↔ tháng`
    : ''
}
Chưa đủ
  ${so(thongKe.khongNgaySinh)} người thiếu / sai ngày sinh
  ${so(thongKe.khongGioiTinh)} người không đọc được giới tính

Kết quả: ${banGhi.length} bản ghi → ${outDir}
  ${tenFile.join('\n  ')}${canhBao.length ? `\n  canh-bao.csv (${canhBao.length} dòng)` : ''}
`);
