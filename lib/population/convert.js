/**
 * GHÉP CÁC BẢNG KẾT XUẤT THÀNH BẢNG `population` CỦA SUPABASE.
 *
 *   nhân khẩu (.ods)  →  toàn bộ nhân khẩu thường trú, một dòng một người
 *   dân tộc  (.xlsx)  →  danh sách lọc theo dân tộc, cột cuối là tên dân tộc
 *   tôn giáo (.xlsx)  →  danh sách lọc theo tôn giáo, cột cuối là tên tôn giáo
 *   hộ khẩu  (.xlsx)  →  một dòng một hộ, cho biết CCCD của chủ hộ (không bắt buộc)
 *   đã xoá   (.xlsx)  →  cùng dạng bảng nhân khẩu, những người đã xoá khỏi hộ
 *                        (không bắt buộc) — vào CSDL với DELETED = true
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
  tachNhom,
} from './fields.js';
import { dinhViCot, laHangTieuDe } from './cot.js';
import { VON_TU_GIA_TRI } from './nhandang.js';
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
  'CRIMINALRECORD',
  'LOCATION',
  'DELETED',
];

/**
 * Vị trí cột giá trị khi giá trị nằm TRÊN TỪNG DÒNG.
 *
 * Bản kết xuất kiểu mới là bảng nhân khẩu có thêm dân tộc / tôn giáo ở cột
 * cuối. Cột đó khi thì được đặt tên ("DANTOC"), khi thì bỏ trống tiêu đề — nên
 * tìm theo tên trước, không thấy thì nếm thử: cột nào có nhiều ô khớp từ vựng
 * dân tộc / tôn giáo nhất thì chính là nó.
 *
 * Nếm bằng TỪ VỰNG ĐÓNG chứ không bắt bừa cột cuối, vì cột cuối rất hay là
 * "Phân loại nhà ở" hoặc một cột trạng thái nào đó.
 */
function doCotGiaTri(rows, cot, { batDau = 1, soThu = 300 } = {}) {
  // `nhom` là cột giá trị của bản kết xuất 31/8/2026 — đặt tên hẳn hoi nên
  // xét trước mọi phép nếm. `nhom_value` chỉ là mã, không phải tên, không dùng.
  if (cot.nhomTen !== undefined) return cot.nhomTen;
  if (cot.danToc !== undefined) return cot.danToc;
  if (cot.tonGiao !== undefined) return cot.tonGiao;

  const daBiDung = new Set(Object.values(cot));
  const diem = new Map();
  let daThu = 0;
  for (let i = batDau; i < rows.length && daThu < soThu; i++) {
    const hang = rows[i];
    if (!hang?.length || laHangTieuDe(hang, cot)) continue;
    daThu++;
    for (let c = 0; c < hang.length; c++) {
      if (daBiDung.has(c)) continue;
      const v = tachNhom(hang[c]).ten;
      if (v && VON_TU_GIA_TRI.has(nhan(v))) diem.set(c, (diem.get(c) ?? 0) + 1);
    }
  }
  if (!diem.size) return -1;

  // Phải phủ được kha khá số dòng đã thử; vài ô trùng từ vựng là ngẫu nhiên.
  const [cotTot, sl] = [...diem].sort((a, b) => b[1] - a[1])[0];
  return sl >= daThu * 0.5 ? cotTot : -1;
}

/**
 * Bảng tra CCCD → giá trị, đọc từ file lọc (dân tộc / tôn giáo).
 *
 * Hai dạng kết xuất cùng tồn tại, nên phải đọc được cả hai:
 *
 *   theo dòng  mỗi dòng có sẵn giá trị ở cột cuối — dạng chuẩn từ 8/2026
 *   theo khối  giá trị nằm ở hàng tiêu đề, áp cho mọi dòng bên dưới — dạng cũ
 *
 * Dạng theo dòng chắc chắn hơn hẳn: không phụ thuộc vào chuyện hàng tiêu đề
 * trang sau có lặp lại giá trị hay không.
 */
export function bangTra(rows, { ten }) {
  const tieuDe = rows[0] ?? [];
  const cot = dinhViCot(tieuDe);

  const cotGiaTri = doCotGiaTri(rows, cot);
  if (cotGiaTri >= 0) return traTheoDong(rows, cot, cotGiaTri, ten);

  /**
   * File lọc được kết xuất thành nhiều khối theo trang in, mỗi khối lặp lại
   * hàng tiêu đề — nhưng ô cuối cùng của mỗi hàng tiêu đề không phải tên cột,
   * mà là GIÁ TRỊ áp dụng cho mọi dòng dữ liệu bên dưới nó, cho tới khi gặp
   * hàng tiêu đề kế tiếp (đổi sang giá trị khác).
   */
  const oCuoi = (hang) => {
    let c = hang.length - 1;
    while (c >= 0 && !String(hang[c] ?? '').trim()) c--;
    if (c < 0) return '';
    // Khối không kèm giá trị thì ô cuối là TÊN CỘT ("Phân loại nhà ở"), không
    // phải dân tộc/tôn giáo. Tập từ vựng đóng nên loại được ngay tại đây.
    const v = tachNhom(hang[c]).ten;
    return VON_TU_GIA_TRI.has(nhan(v)) ? hoa(v) : '';
  };

  const tra = new Map();
  let trong = 0;
  let coGiaTri = 0;
  let giaTriHienHanh = oCuoi(tieuDe);

  for (const hang of rows.slice(1)) {
    if (!hang.length) continue;
    if (laHangTieuDe(hang, cot)) {
      /**
       * NHÓM ĐÔNG NGƯỜI BỊ CẮT THÀNH NHIỀU TRANG, VÀ CHỈ TRANG ĐẦU GHI GIÁ TRỊ.
       *
       * Bản kết xuất phân trang 100 dòng. Trang đầu của nhóm có hàng tiêu đề
       * kết thúc bằng tên dân tộc; các trang sau lặp lại hàng tiêu đề nhưng ô
       * cuối trở về tên cột ("Phân loại nhà ở"):
       *
       *   100 × Chơ Ho      ← trang 1, có giá trị
       *   100 × (tên cột)   ← trang 2..6, vẫn là Chơ Ho
       *    86 × (tên cột)
       *
       * Nên hàng tiêu đề KHÔNG có giá trị nghĩa là "nhóm cũ chạy tiếp", không
       * phải "hết giá trị". Xoá trắng ở đây là mất dân tộc của 1278/2080 người
       * trong bản kết xuất Hàng Gòn 8/2026 — toàn bộ phần đuôi của mọi nhóm
       * đông hơn một trang.
       */
      const v = oCuoi(hang);
      if (v) giaTriHienHanh = v;
      continue;
    }
    const cccd = chuanCccd(hang[cot.cccd]);
    if (!cccd) continue;
    if (giaTriHienHanh) coGiaTri++;
    else trong++;
    tra.set(cccd, giaTriHienHanh);
  }

  if (!coGiaTri) {
    throw new Error(
      `File ${ten}: không đọc được giá trị dân tộc/tôn giáo ở hàng tiêu đề nào — ` +
        'kiểm tra lại xem bản kết xuất có kèm cột dân tộc/tôn giáo không.',
    );
  }
  return { tra, trong };
}

/** Dạng chuẩn: mỗi dòng tự mang giá trị của nó. */
function traTheoDong(rows, cot, cotGiaTri, ten) {
  const tra = new Map();
  let trong = 0;
  let coGiaTri = 0;

  for (const hang of rows.slice(1)) {
    if (!hang.length || laHangTieuDe(hang, cot)) continue;
    const cccd = chuanCccd(hang[cot.cccd]);
    if (!cccd) continue;
    // Bỏ mã hệ thống ở đầu ô: "01-Kinh" → "Kinh". Xem `tachNhom`.
    const v = tachNhom(hang[cotGiaTri]).ten;
    // Ô lạ (không nằm trong 54 dân tộc / danh sách tôn giáo) coi như bỏ trống,
    // chứ không chép nguyên vào CSDL — ghi bừa là bịa dữ liệu.
    const giaTri = v && VON_TU_GIA_TRI.has(nhan(v)) ? hoa(v) : '';
    if (giaTri) coGiaTri++;
    else trong++;
    tra.set(cccd, giaTri);
  }

  if (!coGiaTri) {
    throw new Error(`File ${ten}: cột giá trị dò được nhưng không ô nào đọc ra dân tộc/tôn giáo.`);
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
 * @param {object} nguon `{ nhanKhau, danToc, tonGiao, hoKhau, daXoa }` — mảng hàng đã đọc
 * @param {object} [opts]
 * @param {string} [opts.donVi] tên đơn vị cấp xã dùng để cắt đuôi địa chỉ
 * @param {boolean} [opts.macDinhKinh] ai không có trong file dân tộc thì ghi KINH
 * @returns {{banGhi: object[], canhBao: object[], thongKe: object}}
 */
export function chuyenDoi(
  { nhanKhau, danToc, tonGiao, hoKhau, daXoa },
  { donVi = 'Hàng Gòn', macDinhKinh = false } = {},
) {
  const traDanToc = danToc ? bangTra(danToc, { ten: 'dân tộc' }) : { tra: new Map(), trong: 0 };
  const traTonGiao = tonGiao ? bangTra(tonGiao, { ten: 'tôn giáo' }) : { tra: new Map(), trong: 0 };
  const traChuHo = hoKhau ? bangChuHo(hoKhau) : new Map();

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
    xoaDoc: 0,
    xoaThieuCccd: 0,
    xoaVanDangO: 0,
    xoaTrung: 0,
    daXoa: 0,
    quanHeXoa: 0,
  };

  /** CCCD → dòng, của những người đã xoá được ghi vào kết quả. */
  const daCoXoa = new Map();
  /** Như `theoHo`, nhưng chỉ chứa người đã xoá — suy quan hệ ở lượt riêng. */
  const theoHoXoa = new Map();

  /**
   * Đọc một dòng thành bản ghi `population`.
   *
   * Bảng đang ở và bảng đã xoá cùng một dạng nên đi chung đường này; chỉ khác
   * nhau ở chỗ xếp người vào nhóm hộ nào để suy quan hệ, và ở cờ DELETED.
   */
  function docNguoi(hang, oCot, dong, { xoa }) {
    const hoTen = hoa(oCot(hang, 'hoTen'));
    const cccd = chuanCccd(oCot(hang, 'cccd'));
    if (!cccd) {
      thongKe[xoa ? 'xoaThieuCccd' : 'thieuCccd']++;
      canhBao.push({
        dong,
        hoTen,
        cccd: '',
        lyDo: `${xoa ? 'bảng đã xoá: ' : ''}không có số CCCD — bỏ qua vì đây là khoá chính`,
      });
      return;
    }
    if (xoa) {
      /**
       * NGƯỜI ĐÃ XOÁ VẪN CÓ THỂ ĐANG Ở — bản ghi đang ở luôn thắng.
       *
       * Xoá khỏi hộ này rồi nhập vào hộ khác trong cùng đơn vị là chuyện
       * thường: 804/3635 người trong bản kết xuất xoá Hàng Gòn 10/2026 vẫn có
       * tên trong bảng nhân khẩu. CCCD là khoá chính nên mỗi người chỉ được
       * một dòng — và dòng đó phải là chỗ người ta đang ở, DELETED = false.
       */
      if (daCo.has(cccd)) {
        thongKe.xoaVanDangO++;
        return;
      }
      // Một người bị xoá nhiều lần (nhập rồi xoá, nhập rồi xoá) thì giữ dòng đầu.
      if (daCoXoa.has(cccd)) {
        thongKe.xoaTrung++;
        return;
      }
      daCoXoa.set(cccd, dong);
    } else {
      if (daCo.has(cccd)) {
        thongKe.trungCccd++;
        canhBao.push({ dong, hoTen, cccd, lyDo: `trùng CCCD với dòng ${daCo.get(cccd)} — bỏ qua` });
        return;
      }
      daCo.set(cccd, dong);
    }

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
    const nhomHo = xoa ? theoHoXoa : theoHo;
    if (soHok) {
      if (!nhomHo.has(soHok)) nhomHo.set(soHok, []);
      nhomHo.get(soHok).push({
        cccd,
        ten: hoTen,
        nam: gioiTinh === true,
        moc: mocNgay(ngaySinh.giaTri),
        cha,
        me,
        tenChuHo: chuHo,
        viTri: banGhi.length,
      });
    } else if (!xoa) {
      thongKe.khongSoHo++;
    }

    // Số liệu ghép dân tộc / tôn giáo chỉ đếm người đang ở, để so được với
    // các lượt chạy trước khi chưa có bảng đã xoá.
    let danTocNguoi = locGiaTri(traDanToc.tra.get(cccd) ?? '');
    if (danTocNguoi) {
      if (!xoa) thongKe.coDanToc++;
    }
    // Chỉ suy ra KINH cho người KHÔNG có tên trong danh sách dân tộc. Người có
    // tên nhưng bỏ trống ô dân tộc là "chưa rõ", suy thành KINH là bịa. Người
    // đã xoá thì không bao giờ: họ vắng mặt trong file dân tộc là vì đã xoá,
    // chứ chẳng nói gì về dân tộc của họ.
    else if (macDinhKinh && !xoa && !traDanToc.tra.has(cccd)) {
      danTocNguoi = 'KINH';
      thongKe.macDinhKinh++;
    }

    const tonGiaoNguoi = locGiaTri(traTonGiao.tra.get(cccd) ?? '');
    if (tonGiaoNguoi && !xoa) thongKe.coTonGiao++;
    if (xoa) thongKe.daXoa++;

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
      CRIMINALRECORD: false,
      LOCATION: '',
      DELETED: xoa,
    });
  }

  const cot = dinhViCot(nhanKhau[0] ?? []);
  const oCot = (hang, ten) => (cot[ten] === undefined ? '' : hang[cot[ten]] ?? '');

  for (const [i, hang] of nhanKhau.slice(1).entries()) {
    const dong = i + 2; // số dòng trong bảng tính, tính cả hàng tiêu đề
    if (!hang.length || !hang.some(Boolean)) continue;
    if (laHangTieuDe(hang, cot)) {
      thongKe.hangTieuDeLap++;
      continue;
    }
    thongKe.hangDoc++;
    docNguoi(hang, oCot, dong, { xoa: false });
  }

  // Đọc SAU bảng đang ở, để `daCo` đã đủ mặt mọi người đang ở khi xét trùng.
  if (daXoa) {
    const cotXoa = dinhViCot(daXoa[0] ?? []);
    const oCotXoa = (hang, ten) => (cotXoa[ten] === undefined ? '' : hang[cotXoa[ten]] ?? '');
    for (const [i, hang] of daXoa.slice(1).entries()) {
      if (!hang.length || !hang.some(Boolean) || laHangTieuDe(hang, cotXoa)) continue;
      thongKe.xoaDoc++;
      docNguoi(hang, oCotXoa, `xoá ${i + 2}`, { xoa: true });
    }
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

  /**
   * Quan hệ của người đã xoá — tính theo hộ HIỆN TẠI, không đụng người đang ở.
   *
   * Người đã xoá vẫn mang số hộ cũ, và ppv2 liệt kê cả hộ theo SOHOK — nên quan
   * hệ có nghĩa nhất là quan hệ với chủ hộ đang đứng tên hộ đó. Gộp họ vào cùng
   * hộ với người đang ở để có đủ cây cha/mẹ mà suy, nhưng CHỈ nhận kết quả cho
   * người đã xoá: quan hệ của người đang ở đã chốt ở lượt trên, thêm vài cái
   * tên cũ vào hộ (có khi trùng tên người đang ở) không được làm nó lung lay.
   */
  for (const [hok, dsXoa] of theoHoXoa) {
    const dangO = theoHo.get(hok) ?? [];
    // Chủ hộ lấy theo người đang ở; hộ không còn ai mới tính tới tên người đã xoá khai.
    const chuHo = { cccd: traChuHo.get(hok) ?? '', ten: tenChuHoPhoBien(dangO.length ? dangO : dsXoa) };
    if (!chuHo.cccd && !chuHo.ten) continue;
    const quanHe = suyQuanHeTrongHo([...dangO, ...dsXoa], chuHo);
    for (const p of dsXoa) {
      const qh = quanHe.get(p.cccd);
      if (!qh) continue;
      banGhi[p.viTri].QUANHE = qh;
      thongKe.quanHeXoa++;
    }
  }

  // Người có trong file lọc mà không có trong file nhân khẩu (kể cả bảng đã
  // xoá) là dấu hiệu các file kết xuất lệch thời điểm nhau.
  for (const [ten, { tra }] of [['dân tộc', traDanToc], ['tôn giáo', traTonGiao]]) {
    const thua = [...tra.keys()].filter((c) => !daCo.has(c) && !daCoXoa.has(c));
    thongKe[ten === 'dân tộc' ? 'danTocThua' : 'tonGiaoThua'] = thua.length;
    for (const c of thua.slice(0, 20)) {
      canhBao.push({ dong: '', hoTen: '', cccd: c, lyDo: `có trong file ${ten} nhưng không có trong file nhân khẩu` });
    }
  }

  return { banGhi, canhBao, thongKe };
}
