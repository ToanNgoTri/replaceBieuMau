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
 *
 * File chỉ tên thẳng thì nhận hết; file quét được trong thư mục thì phải có từ
 * khoá trong tên — thư mục Tải về của người dùng còn hàng chục bảng tính khác.
 */
function gomFile(duongDan) {
  const out = [];
  for (const p of duongDan) {
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        if (/\.(ods|xlsx)$/i.test(f) && !f.startsWith('~') && !f.startsWith('.')) {
          out.push({ file: path.join(p, f), tuThuMuc: true });
        }
      }
    } else {
      out.push({ file: p, tuThuMuc: false });
    }
  }
  return out;
}

/** Đoán vai trò của từng file theo tên: dân tộc, tôn giáo, hay bảng nhân khẩu. */
function phanVai(files) {
  const vai = { danToc: [], tonGiao: [], nhanKhau: [] };
  for (const { file, tuThuMuc } of files) {
    const ten = khongDau(path.basename(file)).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ten.includes('dantoc')) vai.danToc.push(file);
    else if (ten.includes('tongiao')) vai.tonGiao.push(file);
    else if (ten.includes('nhankhau') || !tuThuMuc) vai.nhanKhau.push(file);
  }
  return vai;
}

const files = gomFile(nguon);
if (!files.length) {
  console.error('Không tìm thấy file .ods hoặc .xlsx nào.\n' + CACH_DUNG);
  process.exit(1);
}

const vai = phanVai(files);
for (const [ten, ds] of Object.entries(vai)) {
  if (ds.length > 1) {
    console.error(
      `Có ${ds.length} file cùng nhận là "${ten}":\n  ` +
        ds.map((f) => path.basename(f)).join('\n  ') +
        '\nChỉ đưa vào một file cho mỗi loại, hoặc chỉ định thẳng từng file.',
    );
    process.exit(1);
  }
}
if (!vai.nhanKhau.length) {
  console.error(
    'Thiếu bảng nhân khẩu. Khi quét cả thư mục, tên file phải chứa "nhan khau", ' +
      '"dan toc", "ton giao" (không phân biệt dấu). Hoặc chỉ tên thẳng từng file.',
  );
  process.exit(1);
}

const thongKeNgay = {};

function doc(file, laNhanKhau) {
  const buf = fs.readFileSync(file);
  if (/\.ods$/i.test(file)) {
    return docOds(buf, { doiNgayThang, thongKe: laNhanKhau ? thongKeNgay : {} });
  }
  return docXlsx(buf);
}

console.log('Đọc:');
for (const [ten, ds] of Object.entries(vai)) {
  if (ds.length) console.log(`  ${ten.padEnd(9)} ${path.basename(ds[0])}`);
}

const nguonBang = {
  nhanKhau: doc(vai.nhanKhau[0], true),
  danToc: vai.danToc.length ? doc(vai.danToc[0]) : null,
  tonGiao: vai.tonGiao.length ? doc(vai.tonGiao[0]) : null,
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
console.log(`
Nguồn
  ${so(thongKe.hangDoc)} dòng dữ liệu (${thongKe.hangTieuDeLap} hàng tiêu đề lặp đã bỏ)
  ${so(thongKe.thieuCccd)} dòng không có CCCD — bỏ, vì CCCD là khoá chính
  ${so(thongKe.trungCccd)} dòng trùng CCCD — giữ dòng đầu

Ghép thêm
  ${so(thongKe.coDanToc)} người có dân tộc${thongKe.macDinhKinh ? `, ${thongKe.macDinhKinh} người mặc định KINH` : ''}
  ${so(thongKe.coTonGiao)} người có tôn giáo
  ${so(thongKe.danTocThua ?? 0)} + ${thongKe.tonGiaoThua ?? 0} người ở file lọc không thấy trong bảng nhân khẩu

Suy diễn
  ${so(thongKe.laChuHo)} QUANHE = CHỦ HỘ
  ${so(thongKe.laCon)} QUANHE = CON
  ${so(banGhi.length - thongKe.laChuHo - thongKe.laCon)} QUANHE để trống (không đủ căn cứ suy ra)
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
