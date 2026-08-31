/**
 * CHẠY MỘT LƯỢT CHUYỂN ĐỔI — từ đường dẫn nguồn tới file CSV / JSON trên đĩa.
 *
 * Dòng lệnh và giao diện web chỉ khác nhau ở cách hỏi tham số và cách in kết
 * quả. Toàn bộ trình tự ở giữa nằm ở đây, nên hai lối vào không thể cho ra hai
 * kết quả khác nhau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chuyenDoi, COT_POPULATION } from './convert.js';
import { chiaMe, taoCsv } from './csv.js';
import { taoJson } from './json.js';
import { chonNguon, docNguon, gomFile, nhanDangFiles } from './nguon.js';

/** Định dạng xuất ra đĩa. `caHai` ghi cả hai, cùng một đống bản ghi. */
export const CAC_DINH_DANG = ['csv', 'json', 'caHai'];

/** Đuôi file của từng định dạng, kèm hàm sinh nội dung. */
const BO_XUAT = {
  csv: { duoi: 'csv', ra: taoCsv },
  json: { duoi: 'json', ra: taoJson },
};

/** Cột của file cảnh báo — cùng thứ tự ở cả CSV lẫn JSON. */
const COT_CANH_BAO = ['dong', 'cccd', 'hoTen', 'lyDo'];

/** `'csv' | 'json' | 'caHai'` → danh sách bộ xuất cần chạy. */
function bosXuat(dinhDang) {
  if (dinhDang === 'json') return [BO_XUAT.json];
  if (dinhDang === 'caHai') return [BO_XUAT.csv, BO_XUAT.json];
  if (dinhDang && dinhDang !== 'csv') {
    throw new Error(`Không có định dạng "${dinhDang}". Chỉ có: ${CAC_DINH_DANG.join(', ')}.`);
  }
  return [BO_XUAT.csv];
}

/**
 * Ngó thư mục/các file nguồn rồi chốt xem file nào đóng vai nào.
 *
 * Tách riêng khỏi `chayChuyenDoi` để giao diện gọi được một mình: người dùng
 * cần nhìn thấy máy đoán ra gì TRƯỚC khi chạy, mới biết chỗ nào phải sửa tay.
 */
export function quetNguon(nguon, { chiDinh = {}, doiNgayThang = true, boNho = null } = {}) {
  const files = gomFile(nguon);
  if (!files.length) {
    return { files: [], daNgo: [], chon: {}, ghiChu: [], loi: ['Không tìm thấy file .ods hoặc .xlsx nào.'] };
  }
  const daNgo = nhanDangFiles(files, { doiNgayThang, boNho });
  return { files, daNgo, ...chonNguon(daNgo, chiDinh) };
}

/**
 * Đọc trọn nguồn đã chốt, chuyển đổi, ghi file theo `dinhDang`.
 *
 * @param {object} opts.chon  kết quả `quetNguon().chon`
 * @returns thống kê để bên gọi tự trình bày
 */
export function chayChuyenDoi({
  chon,
  outDir,
  donVi = 'Hàng Gòn',
  macDinhKinh = false,
  chia = 0,
  doiNgayThang = true,
  dinhDang = 'csv',
}) {
  if (!chon?.nhanKhau) throw new Error('Chưa chọn được bảng nhân khẩu.');
  const boXuat = bosXuat(dinhDang);

  const thongKeNgay = {};
  const nguonBang = docNguon(chon, { doiNgayThang, thongKeNgay });
  const { banGhi, canhBao, thongKe } = chuyenDoi(nguonBang, { donVi, macDinhKinh });

  fs.mkdirSync(outDir, { recursive: true });
  const me = chiaMe(banGhi, chia);
  const tenFile = [];
  for (const { duoi, ra } of boXuat) {
    for (const [i, phan] of me.entries()) {
      const ten =
        me.length === 1
          ? `population.${duoi}`
          : `population-${String(i + 1).padStart(2, '0')}.${duoi}`;
      fs.writeFileSync(path.join(outDir, ten), ra(phan, COT_POPULATION), 'utf8');
      tenFile.push({ ten, dong: phan.length });
    }
    if (canhBao.length) {
      const ten = `canh-bao.${duoi}`;
      fs.writeFileSync(path.join(outDir, ten), ra(canhBao, COT_CANH_BAO), 'utf8');
      tenFile.push({ ten, dong: canhBao.length });
    }
  }

  return { banGhi, canhBao, thongKe, thongKeNgay, tenFile, outDir, dinhDang };
}
