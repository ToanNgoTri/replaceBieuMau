/**
 * GHÉP CÁC BẢNG KẾT XUẤT THÀNH BẢNG `population` CỦA SUPABASE.
 *
 *   nhân khẩu (.ods)  →  toàn bộ nhân khẩu thường trú, một dòng một người
 *   dân tộc  (.xlsx)  →  danh sách lọc theo dân tộc, cột cuối là tên dân tộc
 *   tôn giáo (.xlsx)  →  danh sách lọc theo tôn giáo, cột cuối là tên tôn giáo
 *   hộ khẩu  (.xlsx)  →  một dòng một hộ, cho biết CCCD của chủ hộ (không bắt buộc)
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
} from './fields.js';
import { dinhViCot, laHangTieuDe } from './cot.js';
import { suyQuanHeTrongHo } from './quanhe.js';

export { dinhViCot };

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

/**
 * Bảng hộ khẩu → `Map(số hộ khẩu → CCCD chủ hộ)`.
 *
 * Đây là thứ bảng nhân khẩu không có: nó chỉ ghi TÊN chủ hộ, mà tên thì trùng
 * được. Có CCCD thì xác định chủ hộ trong hộ là chắc chắn.
 */
export function bangChuHo(rows) {
  const cot = dinhViCot(rows[0] ?? [], ['cccd', 'soHoSo']);
  const tra = new Map();
  for (const hang of rows.slice(1)) {
    if (!hang.length || laHangTieuDe(hang, cot)) continue;
    const hok = chuanSoHok(hang[cot.soHoSo]);
    const cccd = chuanCccd(hang[cot.cccd]);
    if (hok && cccd) tra.set(hok, cccd);
  }
  if (!tra.size) throw new Error('File hộ khẩu không đọc được dòng nào có cả số hộ và CCCD chủ hộ.');
  return tra;
}

/**
 * Tên chủ hộ mà cả hộ cùng khai.
 *
 * Lấy tên xuất hiện nhiều nhất, vì có hộ khai lệch nhau — hộ 003655 có hai
 * người ghi hai tên chủ hộ khác nhau.
 */
function tenChuHoPhoBien(ds) {
  const dem = new Map();
  for (const p of ds) if (p.tenChuHo) dem.set(p.tenChuHo, (dem.get(p.tenChuHo) ?? 0) + 1);
  let ten = '';
  let nhieuNhat = 0;
  for (const [t, n] of dem) if (n > nhieuNhat) [ten, nhieuNhat] = [t, n];
  return ten;
}

/** Ngày `DD/MM/YYYY` → số so sánh được, để biết ai sinh trước ai. */
function mocNgay(ngay) {
  const [d, m, y] = String(ngay).split('/');
  return y ? +y * 10000 + +m * 100 + +d : 0;
}

/** Giá trị nghĩa là "không có thông tin", không nên ghi vào CSDL. */
const KHONG_RO = /^(chua co thong tin|khong ro|khong xac dinh|na)$/;

function locGiaTri(v) {
  return v && !KHONG_RO.test(nhan(v)) ? v : '';
}

/**
 * @param {object} nguon `{ nhanKhau, danToc, tonGiao, hoKhau }` — mảng hàng đã đọc
 * @param {object} [opts]
 * @param {string} [opts.donVi] tên đơn vị cấp xã dùng để cắt đuôi địa chỉ
 * @param {boolean} [opts.macDinhKinh] ai không có trong file dân tộc thì ghi KINH
 * @returns {{banGhi: object[], canhBao: object[], thongKe: object}}
 */
export function chuyenDoi(
  { nhanKhau, danToc, tonGiao, hoKhau },
  { donVi = 'Hàng Gòn', macDinhKinh = false } = {},
) {
  const traDanToc = danToc ? bangTra(danToc, { ten: 'dân tộc' }) : { tra: new Map(), trong: 0 };
  const traTonGiao = tonGiao ? bangTra(tonGiao, { ten: 'tôn giáo' }) : { tra: new Map(), trong: 0 };
  const traChuHo = hoKhau ? bangChuHo(hoKhau) : new Map();

  const cot = dinhViCot(nhanKhau[0] ?? []);
  const banGhi = [];
  const canhBao = [];
  const daCo = new Map();
  const theoHo = new Map();
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
    soHo: 0,
    hoChuHoVang: 0,
    hoTheoHoKhau: 0,
    hoTheoTen: 0,
    hoKhongBietChuHo: 0,
    khongSoHo: 0,
    quanHe: {},
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
    const soHok = chuanSoHok(oCot(hang, 'soHoSo'));

    // Quan hệ chỉ suy được khi đã có mặt cả hộ, nên để dành tới sau vòng lặp.
    if (soHok) {
      if (!theoHo.has(soHok)) theoHo.set(soHok, []);
      theoHo.get(soHok).push({
        cccd,
        ten: hoTen,
        nam: gioiTinh === true,
        moc: mocNgay(ngaySinh.giaTri),
        cha,
        me,
        tenChuHo: chuHo,
        viTri: banGhi.length,
      });
    } else {
      thongKe.khongSoHo++;
    }

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
      QUANHE: '',
      HOTEN: hoTen,
      NAMSINH: ngaySinh.giaTri,
      GIOITINH: gioiTinh,
      CCCD: cccd,
      SOHOK: soHok,
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

  // ── Suy quan hệ với chủ hộ, từng hộ một ─────────────────────────────────
  thongKe.soHo = theoHo.size;
  for (const [hok, ds] of theoHo) {
    const chuHo = { cccd: traChuHo.get(hok) ?? '', ten: tenChuHoPhoBien(ds) };

    if (chuHo.cccd && ds.some((p) => p.cccd === chuHo.cccd)) thongKe.hoTheoHoKhau++;
    else if (chuHo.ten && ds.some((p) => p.ten === chuHo.ten)) thongKe.hoTheoTen++;
    else if (chuHo.ten) {
      // Chủ hộ không còn trong hộ (mất, chuyển đi). Vẫn suy được con và vợ/chồng
      // của người đó, nhưng chính người đó không có dòng nào để gán CHỦ HỘ.
      thongKe.hoChuHoVang++;
      canhBao.push({ dong: '', hoTen: chuHo.ten, cccd: '', lyDo: `hộ ${hok}: chủ hộ không có trong danh sách nhân khẩu của hộ` });
    } else {
      thongKe.hoKhongBietChuHo++;
      canhBao.push({ dong: '', hoTen: '', cccd: '', lyDo: `hộ ${hok}: không xác định được chủ hộ — cả hộ để trống QUANHE` });
      continue;
    }

    const quanHe = suyQuanHeTrongHo(ds, chuHo);
    for (const p of ds) {
      const qh = quanHe.get(p.cccd);
      if (!qh) continue;
      banGhi[p.viTri].QUANHE = qh;
      thongKe.quanHe[qh] = (thongKe.quanHe[qh] ?? 0) + 1;
    }
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
