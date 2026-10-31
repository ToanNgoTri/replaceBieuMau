/**
 * BẢNG KẾT XUẤT TẠM TRÚ → BẢNG `tamtru` CỦA SUPABASE.
 *
 * Bảng `tamtru` chỉ có 11 cột tạm trú thật sự dùng (xem
 * ppv2web/sql/tao-bang-tamtru.sql) — không có cha/mẹ, dân tộc, tôn giáo, SĐT,
 * vắng nhà, tiền án, đã xóa như `population`. Bản kết xuất tạm trú khác bảng
 * nhân khẩu ở mấy chỗ:
 *
 *   NOITAMTRU  chỗ đang tạm trú trong đơn vị   → NOITAMTRU (cắt đuôi đơn vị)
 *   NOITHTRU   thường trú ở quê                → NOITHTRU (giữ nguyên)
 *   NGAYDEN    ngày đến đăng ký tạm trú        → NGAYDEN
 *   không có   số hộ khẩu, cha, mẹ, dân tộc, tôn giáo
 *
 * Không có số hộ nên SOHOK được DỰNG: những người cùng tên chủ hộ và cùng nơi
 * tạm trú là một hộ, SOHOK = CCCD của chủ hộ đó. Chọn CCCD chứ không đánh số
 * thứ tự để lần nhập sau vẫn ra đúng số cũ.
 */
import { catDiaGioi, chuanCccd, chuanGioiTinh, chuanNgaySinh, hoa, nhan } from './fields.js';
import { dinhViCot, laHangTieuDe } from './cot.js';

/**
 * Thứ tự cột trong CSV — đúng thứ tự cột của bảng `tamtru`. Thừa một cột là
 * Supabase từ chối cả file ("column … does not exist").
 */
export const COT_TAMTRU = [
  'QUANHE',
  'HOTEN',
  'NAMSINH',
  'GIOITINH',
  'CCCD',
  'SOHOK',
  'NOITHTRU',
  'GHICHU',
  'NOITAMTRU',
  'LOCATION',
  'NGAYDEN',
];

/** Ngày `DD/MM/YYYY` → số so sánh được. */
function mocNgay(ngay) {
  const [d, m, y] = String(ngay).split('/');
  return y ? +y * 10000 + +m * 100 + +d : 0;
}

/**
 * @param {string[][]} rows bảng tạm trú đã đọc, hàng đầu là tiêu đề
 * @param {object} [opts]
 * @param {string} [opts.donVi] tên đơn vị cấp xã dùng để cắt đuôi nơi tạm trú
 * @returns {{banGhi: object[], canhBao: object[], thongKe: object}}
 */
export function chuyenDoiTamTru(rows, { donVi = 'Hàng Gòn' } = {}) {
  const cot = dinhViCot(rows[0] ?? [], ['hoTen', 'cccd', 'noiTamTru']);
  const oCot = (hang, ten) => (cot[ten] === undefined ? '' : hang[cot[ten]] ?? '');

  const canhBao = [];
  const thongKe = {
    hangDoc: 0,
    thieuCccd: 0,
    dangKyCu: 0,
    khongNgaySinh: 0,
    khongGioiTinh: 0,
    soHo: 0,
    hoCoChuHo: 0,
    hoVangChuHo: 0,
    oMotMinh: 0,
  };

  /**
   * MỘT NGƯỜI CÓ THỂ ĐĂNG KÝ TẠM TRÚ NHIỀU LẦN — giữ lần MỚI NHẤT.
   *
   * Bản kết xuất giữ cả lịch sử: cùng một CCCD xuất hiện 2–3 lần với nơi tạm
   * trú và ngày đến khác nhau (494/2809 dòng trong bản 10/2026). CCCD là khoá
   * chính nên chỉ được một dòng, và dòng đúng là lần đăng ký có ngày đến muộn
   * nhất — không dựa vào thứ tự dòng trong file.
   */
  const theoCccd = new Map();
  for (const [i, hang] of rows.slice(1).entries()) {
    const dong = i + 2;
    if (!hang.length || !hang.some(Boolean) || laHangTieuDe(hang, cot)) continue;
    thongKe.hangDoc++;

    const hoTen = hoa(oCot(hang, 'hoTen'));
    const cccd = chuanCccd(oCot(hang, 'cccd'));
    if (!cccd) {
      thongKe.thieuCccd++;
      canhBao.push({ dong, hoTen, cccd: '', lyDo: 'không có số CCCD — bỏ qua vì đây là khoá chính' });
      continue;
    }

    const ngayDen = chuanNgaySinh(oCot(hang, 'ngayDen')).giaTri;
    const cu = theoCccd.get(cccd);
    if (cu) {
      thongKe.dangKyCu++;
      if (mocNgay(ngayDen) <= mocNgay(cu.ngayDen)) continue;
    }
    theoCccd.set(cccd, { hang, dong, hoTen, cccd, ngayDen });
  }

  const banGhi = [];
  for (const { hang, dong, hoTen, cccd, ngayDen } of theoCccd.values()) {
    const ngaySinh = chuanNgaySinh(oCot(hang, 'ngaySinh'));
    if (!ngaySinh.giaTri) {
      thongKe.khongNgaySinh++;
      canhBao.push({ dong, hoTen, cccd, lyDo: ngaySinh.loi || 'không có ngày sinh' });
    }
    const gioiTinh = chuanGioiTinh(oCot(hang, 'gioiTinh'));
    if (gioiTinh === null) {
      thongKe.khongGioiTinh++;
      canhBao.push({ dong, hoTen, cccd, lyDo: `giới tính không đọc được: "${oCot(hang, 'gioiTinh')}"` });
    }

    banGhi.push({
      QUANHE: '',
      HOTEN: hoTen,
      NAMSINH: ngaySinh.giaTri,
      GIOITINH: gioiTinh,
      CCCD: cccd,
      SOHOK: '',
      NOITHTRU: hoa(oCot(hang, 'noiThTru')),
      GHICHU: '',
      NOITAMTRU: hoa(catDiaGioi(oCot(hang, 'noiTamTru'), donVi)),
      LOCATION: '',
      NGAYDEN: ngayDen,
      // tạm giữ để dựng hộ, không xuất ra file
      _chuHo: hoa(oCot(hang, 'chuHo')),
    });
  }

  // ── Dựng hộ: cùng tên chủ hộ + cùng nơi tạm trú ──────────────────────────
  const theoHo = new Map();
  for (const b of banGhi) {
    if (!b._chuHo) {
      // Không ghi chủ hộ = đăng ký tạm trú một mình: tự thành một hộ.
      thongKe.oMotMinh++;
      b.SOHOK = b.CCCD;
      continue;
    }
    const khoa = `${b._chuHo}|${nhan(b.NOITAMTRU)}`;
    if (!theoHo.has(khoa)) theoHo.set(khoa, []);
    theoHo.get(khoa).push(b);
  }

  thongKe.soHo = theoHo.size + thongKe.oMotMinh;
  for (const ds of theoHo.values()) {
    const chuHo = ds.find((b) => b.HOTEN === ds[0]._chuHo);
    if (chuHo) {
      thongKe.hoCoChuHo++;
      chuHo.QUANHE = 'CHỦ HỘ';
    } else {
      // Chủ hộ không đăng ký tạm trú cùng (thường là chủ nhà trọ). Vẫn gom hộ,
      // lấy CCCD người đầu tiên làm số hộ.
      thongKe.hoVangChuHo++;
    }
    const soHok = (chuHo ?? ds[0]).CCCD;
    for (const b of ds) b.SOHOK = soHok;
  }

  for (const b of banGhi) delete b._chuHo;
  return { banGhi, canhBao, thongKe };
}
