/**
 * GHÉP BA BẢNG KẾT XUẤT THÀNH BẢNG `population` CỦA SUPABASE.
 *
 *   nhân khẩu (.ods)  →  toàn bộ nhân khẩu thường trú, một dòng một người
 *   dân tộc  (.xlsx)  →  danh sách lọc theo dân tộc, cột cuối là tên dân tộc
 *   tôn giáo (.xlsx)  →  danh sách lọc theo tôn giáo, cột cuối là tên tôn giáo
 *
 * Hai file lọc không có tiêu đề cho cột giá trị (cột ngay sau cột cuối cùng có
 * tiêu đề), nên tên dân tộc / tôn giáo được lấy theo vị trí. Khoá ghép là CCCD
 * đã đệm đủ 12 số — trước khi đệm thì mã tỉnh 0xx của hai bảng lệch nhau.
 */
import {
  catDiaGioi,
  chuanCccd,
  chuanDacThu,
  chuanGioiTinh,
  chuanNgaySinh,
  chuanSoHok,
  hoa,
  nhan,
  suyQuanHe,
} from './fields.js';

/** Thứ tự cột trong CSV — đúng thứ tự cột của bảng `population`. */
export const COT_POPULATION = [
  'QUANHE',
  'HOTEN',
  'NAMSINH',
  'GIOITINH',
  'CCCD',
  'SOHOK',
  'NOITHTRU',
  'TENCHA',
  'TENME',
  'DANTOC',
  'TONGIAO',
  'GHICHU',
  'VANGNHA',
  'NOIOHIENTAI',
  'SDT',
  'PRINTED',
  'CRIMINALRECORD',
];

/** Cách nhận ra từng cột trong bảng kết xuất, theo nhãn đã bỏ dấu. */
const NHAN_COT = {
  hoTen: (l) => l === 'ho va ten',
  ngaySinh: (l) => l === 'ngay sinh',
  gioiTinh: (l) => l === 'gioi tinh',
  cccd: (l) => /(ddcn|cccd|cmnd)/.test(l),
  chuHo: (l) => l === 'ho va ten chu ho',
  soHoSo: (l) => /^so (hsct|hshk|ho so)/.test(l),
  noiThTru: (l) => l === 'noi thuong tru',
  noiOHienTai: (l) => l === 'noi o hien tai',
  cha: (l) => l === 'ho ten cha',
  me: (l) => l === 'ho ten me',
  dacThu: (l) => l.startsWith('trang thai nk'),
};

const BAT_BUOC = ['hoTen', 'cccd'];

/** Dò vị trí từng cột trong hàng tiêu đề. */
export function dinhViCot(tieuDe) {
  const nhanCot = tieuDe.map(nhan);
  const cot = {};
  for (const [ten, khop] of Object.entries(NHAN_COT)) {
    const i = nhanCot.findIndex((l) => l && khop(l));
    if (i >= 0) cot[ten] = i;
  }
  const thieu = BAT_BUOC.filter((k) => cot[k] === undefined);
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
function laHangTieuDe(hang, cot) {
  return nhan(hang[cot.hoTen]) === 'ho va ten';
}

/**
 * Bảng tra CCCD → giá trị, đọc từ file lọc (dân tộc / tôn giáo).
 *
 * Cột giá trị không có tiêu đề nên lấy theo vị trí: ngay sau cột cuối cùng
 * được đặt tên.
 */
export function bangTra(rows, { ten }) {
  const tieuDe = rows[0] ?? [];
  const cot = dinhViCot(tieuDe);
  const cotGiaTri = tieuDe.length;

  const tra = new Map();
  let trong = 0;
  let coGiaTri = 0;
  for (const hang of rows.slice(1)) {
    if (!hang.length || laHangTieuDe(hang, cot)) continue;
    const cccd = chuanCccd(hang[cot.cccd]);
    if (!cccd) continue;
    const giaTri = hoa(hang[cotGiaTri]);
    if (giaTri) coGiaTri++;
    else trong++;
    // Vẫn ghi cả người bỏ trống ô giá trị: có tên trong danh sách lọc là một
    // thông tin, khác hẳn với không có tên.
    tra.set(cccd, giaTri);
  }

  if (!coGiaTri) {
    throw new Error(
      `File ${ten}: cột giá trị (cột thứ ${cotGiaTri + 1}) không có dữ liệu — ` +
        'kiểm tra lại xem bản kết xuất có kèm cột dân tộc/tôn giáo không.',
    );
  }
  return { tra, trong };
}

/** Giá trị nghĩa là "không có thông tin", không nên ghi vào CSDL. */
const KHONG_RO = /^(chua co thong tin|khong ro|khong xac dinh|na)$/;

function locGiaTri(v) {
  return v && !KHONG_RO.test(nhan(v)) ? v : '';
}

/**
 * @param {object} nguon `{ nhanKhau, danToc, tonGiao }` — mảng hàng đã đọc
 * @param {object} [opts]
 * @param {string} [opts.donVi] tên đơn vị cấp xã dùng để cắt đuôi địa chỉ
 * @param {boolean} [opts.macDinhKinh] ai không có trong file dân tộc thì ghi KINH
 * @returns {{banGhi: object[], canhBao: object[], thongKe: object}}
 */
export function chuyenDoi({ nhanKhau, danToc, tonGiao }, { donVi = 'Hàng Gòn', macDinhKinh = false } = {}) {
  const traDanToc = danToc ? bangTra(danToc, { ten: 'dân tộc' }) : { tra: new Map(), trong: 0 };
  const traTonGiao = tonGiao ? bangTra(tonGiao, { ten: 'tôn giáo' }) : { tra: new Map(), trong: 0 };

  const cot = dinhViCot(nhanKhau[0] ?? []);
  const banGhi = [];
  const canhBao = [];
  const daCo = new Map();
  const thongKe = {
    hangDoc: 0,
    hangTieuDeLap: 0,
    thieuCccd: 0,
    trungCccd: 0,
    khongNgaySinh: 0,
    khongGioiTinh: 0,
    coDanToc: 0,
    coTonGiao: 0,
    macDinhKinh: 0,
    laChuHo: 0,
    laCon: 0,
  };

  const oCot = (hang, ten) => (cot[ten] === undefined ? '' : hang[cot[ten]] ?? '');

  for (const [i, hang] of nhanKhau.slice(1).entries()) {
    const dong = i + 2; // số dòng trong bảng tính, tính cả hàng tiêu đề
    if (!hang.length || !hang.some(Boolean)) continue;
    if (laHangTieuDe(hang, cot)) {
      thongKe.hangTieuDeLap++;
      continue;
    }
    thongKe.hangDoc++;

    const hoTen = hoa(oCot(hang, 'hoTen'));
    const cccd = chuanCccd(oCot(hang, 'cccd'));
    if (!cccd) {
      thongKe.thieuCccd++;
      canhBao.push({ dong, hoTen, cccd: '', lyDo: 'không có số CCCD — bỏ qua vì đây là khoá chính' });
      continue;
    }
    if (daCo.has(cccd)) {
      thongKe.trungCccd++;
      canhBao.push({ dong, hoTen, cccd, lyDo: `trùng CCCD với dòng ${daCo.get(cccd)} — bỏ qua` });
      continue;
    }
    daCo.set(cccd, dong);

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

    const chuHo = hoa(oCot(hang, 'chuHo'));
    const cha = hoa(oCot(hang, 'cha'));
    const me = hoa(oCot(hang, 'me'));
    const quanHe = suyQuanHe({ hoTen, chuHo, cha, me });
    if (quanHe === 'CHỦ HỘ') thongKe.laChuHo++;
    else if (quanHe === 'CON') thongKe.laCon++;

    let danTocNguoi = locGiaTri(traDanToc.tra.get(cccd) ?? '');
    if (danTocNguoi) thongKe.coDanToc++;
    // Chỉ suy ra KINH cho người KHÔNG có tên trong danh sách dân tộc. Người có
    // tên nhưng bỏ trống ô dân tộc là "chưa rõ", suy thành KINH là bịa.
    else if (macDinhKinh && !traDanToc.tra.has(cccd)) {
      danTocNguoi = 'KINH';
      thongKe.macDinhKinh++;
    }

    const tonGiaoNguoi = locGiaTri(traTonGiao.tra.get(cccd) ?? '');
    if (tonGiaoNguoi) thongKe.coTonGiao++;

    banGhi.push({
      QUANHE: quanHe,
      HOTEN: hoTen,
      NAMSINH: ngaySinh.giaTri,
      GIOITINH: gioiTinh,
      CCCD: cccd,
      SOHOK: chuanSoHok(oCot(hang, 'soHoSo')),
      NOITHTRU: hoa(catDiaGioi(oCot(hang, 'noiThTru'), donVi)),
      TENCHA: cha,
      TENME: me,
      DANTOC: danTocNguoi,
      TONGIAO: tonGiaoNguoi,
      GHICHU: hoa(chuanDacThu(oCot(hang, 'dacThu'))),
      VANGNHA: false,
      NOIOHIENTAI: hoa(catDiaGioi(oCot(hang, 'noiOHienTai'), donVi)),
      SDT: '',
      PRINTED: false,
      CRIMINALRECORD: false,
    });
  }

  // Người có trong file lọc mà không có trong file nhân khẩu là dấu hiệu ba
  // file kết xuất lệch thời điểm nhau.
  for (const [ten, { tra }] of [['dân tộc', traDanToc], ['tôn giáo', traTonGiao]]) {
    const thua = [...tra.keys()].filter((c) => !daCo.has(c));
    thongKe[ten === 'dân tộc' ? 'danTocThua' : 'tonGiaoThua'] = thua.length;
    for (const c of thua.slice(0, 20)) {
      canhBao.push({ dong: '', hoTen: '', cccd: c, lyDo: `có trong file ${ten} nhưng không có trong file nhân khẩu` });
    }
  }

  return { banGhi, canhBao, thongKe };
}
