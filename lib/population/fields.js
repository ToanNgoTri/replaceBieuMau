/**
 * CHUẨN HOÁ TỪNG TRƯỜNG — tri thức nghiệp vụ về dữ liệu kết xuất nằm ở đây.
 *
 * Mỗi hàm nhận ô thô trong bảng kết xuất và trả về đúng giá trị mà bảng
 * `population` trên Supabase mong đợi. Tách riêng để test được từng cái một và
 * để chỗ sửa khi hệ thống kết xuất đổi định dạng là một chỗ duy nhất.
 */

/** Bỏ dấu tiếng Việt, dùng để so khớp tên cột — không dùng cho dữ liệu. */
export function khongDau(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Gọn khoảng trắng (kể cả xuống dòng do ô Excel wrap) rồi viết hoa. */
export function hoa(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Nhãn cột đã chuẩn hoá: thường, bỏ dấu, gọn khoảng trắng. */
export function nhan(s) {
  return khongDau(String(s ?? '')).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Số định danh cá nhân — 12 chữ số.
 *
 * Ô CCCD trong bảng kết xuất là ô KIỂU SỐ, nên số 0 đứng đầu (mã tỉnh 001–096)
 * đã bị Excel nuốt mất: 075310019367 nằm trong file thành 75310019367. Đệm 0
 * vào đầu cho đủ 12 ký tự là khôi phục lại đúng giá trị gốc.
 */
export function chuanCccd(raw) {
  const so = String(raw ?? '').replace(/\D/g, '');
  if (!so) return '';
  return so.length < 12 ? so.padStart(12, '0') : so;
}

/**
 * NAMSINH — chuỗi DD/MM/YYYY.
 *
 * ppv2web tách trường này bằng `NAMSINH.split('/')` để lấy {NGAYSINH},
 * {THANGSINH}, {NAMSINH}, nên thứ tự ngày-tháng-năm là bắt buộc.
 */
export function chuanNgaySinh(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return { giaTri: '', loi: s ? `ngày sinh không đọc được: "${s}"` : '' };

  const [, ngay, thang, nam] = m;
  if (+thang < 1 || +thang > 12 || +ngay < 1 || +ngay > 31) {
    return { giaTri: '', loi: `ngày sinh không hợp lệ: "${s}"` };
  }
  return { giaTri: `${ngay.padStart(2, '0')}/${thang.padStart(2, '0')}/${nam}`, loi: '' };
}

/**
 * SOHOK — 6 số cuối của "Số HSCT".
 *
 * Kết xuất ghi 26113-005676 (mã đơn vị + số hồ sơ). Trong ppv2web ô tìm kiếm
 * SOHOK dùng so khớp tuyệt đối (`.eq`) chứ không phải `ilike`, nên phải cắt
 * đúng phần cán bộ vẫn gõ: 005676.
 */
export function chuanSoHok(raw) {
  const so = String(raw ?? '').replace(/\D/g, '');
  return so ? so.slice(-6) : '';
}

/** GIOITINH — boolean, `true` là Nam (đúng quy ước của ppv2web). */
export function chuanGioiTinh(raw) {
  const s = nhan(raw);
  if (s === 'nam') return true;
  if (s === 'nu' || s === 'nư') return false;
  return null;
}

/**
 * Cắt địa chỉ từ tên đơn vị trở về sau.
 *
 * ppv2web tự ghép ", phường Hàng Gòn, thành phố Đồng Nai" vào cuối NOITHTRU lúc
 * sinh văn bản, nên giữ lại phần đó trong CSDL sẽ ra địa chỉ lặp hai lần.
 *
 * Chỉ cắt đúng đoạn CẤP XÃ. "KP Hàng Gòn", "Khu phố Hàng Gòn", "ấp Hàng Gòn"
 * là tên khu phố, phải giữ nguyên — cắt nhầm là mất mức địa chỉ chi tiết nhất.
 */
const TIEN_TO_CAP_XA = [['phuong'], ['phg'], ['phg.'], ['p.'], ['xa'], ['thi', 'tran'], ['tt'], ['tt.']];

/** Vị trí bắt đầu của `mau` nếu nó là đuôi của `tu`, không thì -1. */
function viTriDuoi(tu, mau) {
  const bd = tu.length - mau.length;
  if (bd < 0) return -1;
  return mau.every((w, k) => tu[bd + k] === w) ? bd : -1;
}

export function catDiaGioi(diaChi, donVi = 'Hàng Gòn') {
  const tenTu = nhan(donVi).split(' ');
  const doan = String(diaChi ?? '').split(',');

  for (let i = 0; i < doan.length; i++) {
    const tuGoc = doan[i].trim().split(/\s+/).filter(Boolean);
    const tuNhan = tuGoc.map(nhan);

    let cat = -1;
    for (const tienTo of TIEN_TO_CAP_XA) {
      const bd = viTriDuoi(tuNhan, [...tienTo, ...tenTu]);
      if (bd >= 0) {
        cat = bd;
        break;
      }
    }
    // Đoạn trơ tên đơn vị chỉ được coi là cấp xã khi nó nằm ở đuôi địa chỉ,
    // vì "Hàng Gòn" đứng giữa còn có thể là tên đường hay tên khu phố.
    if (cat < 0 && viTriDuoi(tuNhan, tenTu) === 0 && i >= doan.length - 2) cat = 0;
    if (cat < 0) continue;

    // Nguồn thỉnh thoảng quên dấu phẩy: "ấp Hàng Gòn xã Hàng Gòn". Phần đứng
    // trước chữ "xã" vẫn là địa chỉ thật, phải giữ.
    return [...doan.slice(0, i), tuGoc.slice(0, cat).join(' ')]
      .join(',')
      .replace(/[\s,]+$/, '')
      .trim();
  }
  return String(diaChi ?? '').trim();
}

/** Phần ghi chú vô nghĩa trong cột "Trạng thái NK quản lý đặc thù". */
const DAC_THU_RONG = /không thuộc diện quản lý theo đặc thù/gi;

export function chuanDacThu(raw) {
  return String(raw ?? '')
    .replace(DAC_THU_RONG, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('; ');
}

// QUANHE được suy trong `quanhe.js` — cần cả hộ mới suy được, không phải việc
// của một hàm chuẩn hoá từng ô.
