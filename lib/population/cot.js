/**
 * DÒ CỘT THEO NHÃN TIÊU ĐỀ.
 *
 * Mọi chỗ đọc bảng kết xuất đều đi qua đây, không chỗ nào dùng số thứ tự cột
 * cứng. Nhờ vậy hệ thống dân cư thêm/bớt/đổi chỗ cột thì code không phải sửa —
 * cũng là cách duy nhất để nhận dạng được bảng khi tên file thay đổi.
 */
import { nhan } from './fields.js';

/** Cách nhận ra từng cột trong bảng kết xuất, theo nhãn đã bỏ dấu. */
export const NHAN_COT = {
  hoTen: (l) => l === 'ho va ten' || l === 'hoten',
  ngaySinh: (l) => l === 'ngay sinh' || l === 'ngaysinh',
  gioiTinh: (l) => l === 'gioi tinh' || l === 'gioitinh',
  cccd: (l) => /(ddcn|cccd|cmnd)/.test(l),
  // "Họ và tên chủ hộ" / "Họ tên chủ hộ" (đủ dấu cách) hoặc "CHUHO" (viết dính)
  chuHo: (l) => l === 'ho va ten chu ho' || l === 'ho ten chu ho' || l === 'chuho',
  // "Số HSCT/HSHK/Hồ sơ..." (đủ dấu cách) hoặc "HSHK" (viết dính, không có "Số")
  soHoSo: (l) => /^so (hsct|hshk|ho so)/.test(l) || l === 'hshk' || l === 'hsct',
  noiThTru: (l) => l === 'noi thuong tru' || l === 'noithtru',
  noiOHienTai: (l) => l === 'noi o hien tai' || l === 'noiohientai',
  cha: (l) => l === 'ho ten cha' || l === 'tencha',
  me: (l) => l === 'ho ten me' || l === 'tenme',
  dacThu: (l) => l.startsWith('trang thai nk'),
  ngayLap: (l) => l === 'ngay lap',
};


/** Dò vị trí từng cột trong hàng tiêu đề. `batBuoc` rỗng thì không bao giờ lỗi. */
export function dinhViCot(tieuDe, batBuoc = ['hoTen', 'cccd']) {
  const nhanCot = tieuDe.map(nhan);
  const cot = {};
  for (const [ten, khop] of Object.entries(NHAN_COT)) {
    const i = nhanCot.findIndex((l) => l && khop(l));
    if (i >= 0) cot[ten] = i;
  }
  const thieu = batBuoc.filter((k) => cot[k] === undefined);
  if (thieu.length) {
    throw new Error(
      `Không nhận ra cột ${thieu.join(', ')} trong hàng tiêu đề: ${tieuDe.filter(Boolean).join(' | ')}`,
    );
  }
  return cot;
}

/**
 * Bỏ hàng tiêu đề lặp giữa bảng.
 *
 * Bản kết xuất chèn lại nguyên hàng tiêu đề sau mỗi trang in — 243 lần trong
 * file nhân khẩu — nên phải lọc theo nội dung chứ không chỉ bỏ hàng đầu.
 */
export function laHangTieuDe(hang, cot) {
  const oTen = cot.hoTen ?? cot.chuHo;
  if (oTen === undefined) return false;
  const l = nhan(hang[oTen]);
  return l === 'ho va ten' || l === 'hoten' || l === 'ho ten chu ho' || l === 'chuho';
}