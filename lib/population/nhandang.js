/**
 * NHẬN DẠNG BẢNG KẾT XUẤT THEO NỘI DUNG, KHÔNG THEO TÊN FILE.
 *
 * Tên file kết xuất đổi theo từng lần tải về, nên đoán theo tên là sai sớm hay
 * muộn. Mỗi bảng có dấu hiệu riêng nằm trong chính nội dung:
 *
 *   nhân khẩu  có cột "Họ tên cha" + "Họ tên mẹ", KHÔNG có cột giá trị thêm
 *   hộ khẩu    cột tên là "Họ tên chủ hộ", có "Ngày lập", KHÔNG có cột cha/mẹ
 *   dân tộc    như nhân khẩu, thêm một cột không tiêu đề chứa TÊN DÂN TỘC
 *   tôn giáo   như nhân khẩu, thêm một cột không tiêu đề chứa TÊN TÔN GIÁO
 *
 * Hai file lọc có tiêu đề giống hệt nhau, chỉ khác nhau ở nội dung cột cuối —
 * nên phải phân biệt bằng TỪ VỰNG. Cả hai đều là tập đóng: 54 dân tộc và mười
 * mấy tôn giáo được công nhận, nên đếm số dòng khớp mỗi bên là đủ dứt khoát.
 */
import { dinhViCot, laHangTieuDe } from './cot.js';
import { nhan, tachNhom } from './fields.js';

const TON_GIAO = new Set(
  [
    'không', 'công giáo', 'thiên chúa', 'thiên chúa giáo', 'ki tô', 'cơ đốc',
    'tin lành', 'phật giáo', 'phật giáo hòa hảo', 'hòa hảo', 'cao đài',
    'hồi giáo', 'bà la môn', 'ba la mon', 'bahá i', 'baha i', 'minh sư đạo',
    'minh lý đạo', 'tịnh độ cư sĩ', 'tứ ân hiếu nghĩa', 'bửu sơn kỳ hương',
    'bà la môn giáo', 'phật', 'thiên chúa la mã',
  ].map(nhan),
);

/** 54 dân tộc, kèm các cách viết khác mà bản kết xuất đang dùng. */
const DAN_TOC = new Set(
  [
    'kinh', 'tày', 'thái', 'mường', 'khmer', 'khơ me', 'hoa', 'nùng', 'hmông',
    'mông', 'dao', 'gia rai', 'ê đê', 'ba na', 'sán chay', 'chăm', 'cơ ho',
    'xơ đăng', 'sán dìu', 'hrê', 'ra glai', 'mnông', 'thổ', 'xtiêng', 'khơ mú',
    'bru vân kiều', 'cơ tu', 'giáy', 'tà ôi', 'mạ', 'giẻ triêng', 'co',
    'chơ ro', 'xinh mun', 'hà nhì', 'chu ru', 'lào', 'la chí', 'kháng',
    'phù lá', 'la hủ', 'la ha', 'pà thẻn', 'lự', 'ngái', 'chứt', 'lô lô',
    'mảng', 'cơ lao', 'bố y', 'cống', 'si la', 'pu péo', 'rơ măm', 'brâu',
    'ơ đu', 'người nước ngoài',
    // biến thể có thật trong dữ liệu kết xuất
    'châu ro', 'chro', 'châu', 'chil', 'sán chỉ', 'miên', 'việt gốc miên',
    'tày mường', 'thổ (tày)', 'phén', 'tơ buăn', 'khách gia', 'tà mun',
  ].map(nhan),
);

/** Giá trị có ở cả hai bảng nên không dùng để phân biệt. */
const TRUNG_TINH = new Set(['khac', 'chua co thong tin', 'khong ro', 'khong xac dinh']);

/**
 * Toàn bộ từ vựng hợp lệ của ô giá trị. Dân tộc và tôn giáo đều là TẬP ĐÓNG,
 * nên "giá trị đọc được nhưng không nằm trong tập" chắc chắn không phải giá trị
 * — thường là tên cột cuối cùng của hàng tiêu đề ("Phân loại nhà ở") bị nhặt
 * nhầm khi khối đó không kèm giá trị. Ghi tên cột vào ô DANTOC là bịa dữ liệu,
 * nên `convert.js` dùng tập này để chặn.
 */
export const VON_TU_GIA_TRI = new Set([...TON_GIAO, ...DAN_TOC, ...TRUNG_TINH]);

const VAI = {
  nhanKhau: 'nhân khẩu',
  hoKhau: 'hộ khẩu',
  danToc: 'dân tộc',
  tonGiao: 'tôn giáo',
};

/**
 * @param {string[][]} rows vài trăm hàng đầu của bảng là đủ
 * @returns {{vai: string, dauHieu: string}} `vai` rỗng nghĩa là không phải bảng dân cư
 */
export function nhanDang(rows) {
  const tieuDe = rows[0] ?? [];
  const cot = dinhViCot(tieuDe, []);

  const coTen = cot.hoTen !== undefined;
  const coChuHo = cot.chuHo !== undefined;
  const coChaMe = cot.cha !== undefined && cot.me !== undefined;
  const coSoHo = cot.soHoSo !== undefined;

  // Bảng hộ khẩu: một dòng một hộ, nên cột tên chính là tên chủ hộ và không có
  // cột cha/mẹ của ai cả.
  if (!coTen && coChuHo && coSoHo && !coChaMe) {
    return { vai: 'hoKhau', dauHieu: 'cột tên là "Họ tên chủ hộ", không có cột cha/mẹ' };
  }

  if (!coTen || !coChaMe) {
    const thieu = [!coTen && 'Họ và tên', !coChaMe && 'Họ tên cha/mẹ'].filter(Boolean);
    return { vai: '', dauHieu: `không có cột ${thieu.join(' và ')}` };
  }

  // Cột giá trị của file lọc nằm ngay sau cột cuối cùng có tiêu đề.
  /**
   * File dân tộc/tôn giáo được kết xuất thành nhiều khối theo trang in, mỗi
   * khối lặp lại nguyên hàng tiêu đề — nhưng Ô CUỐI CÙNG của mỗi hàng tiêu đề
   * không phải tên cột, mà chính là GIÁ TRỊ áp cho cả khối (ví dụ "Chăm",
   * "Công Giáo"). File nhân khẩu thuần không có chuyện này: ô cuối luôn là
   * một tên cột thật ("Phân loại nhà ở"...), không khớp danh sách dân tộc/tôn
   * giáo nào cả.
   */
  const oCuoi = (hang) => {
    let c = hang.length - 1;
    while (c >= 0 && !String(hang[c] ?? '').trim()) c--;
    return c >= 0 ? String(hang[c]).trim() : '';
  };

  /**
   * Cột giá trị được ĐẶT TÊN hẳn hoi thì khỏi đoán — đây là dấu hiệu chắc chắn
   * nhất trong cả module này, chắc hơn mọi phép nếm từ vựng bên dưới.
   */
  const coDanToc = cot.danToc !== undefined;
  const coTonGiao = cot.tonGiao !== undefined;
  if (coDanToc && coTonGiao) {
    return {
      vai: '',
      dauHieu: 'có cả cột dân tộc lẫn tôn giáo — chỉ định thẳng file muốn dùng cho vai nào',
    };
  }
  if (coDanToc) return { vai: 'danToc', dauHieu: 'có cột dân tộc đặt tên sẵn' };
  if (coTonGiao) return { vai: 'tonGiao', dauHieu: 'có cột tôn giáo đặt tên sẵn' };

  /**
   * DẠNG 31/8/2026: cột giá trị tên `nhom`, giá trị mang mã ở đầu ("01-Kinh").
   *
   * File dân tộc và file tôn giáo có tiêu đề GIỐNG HỆT nhau — cùng `nhom` /
   * `nhom_value` — nên cái tên cột không phân biệt được hai bên, vẫn phải nếm
   * từ vựng. Nhưng đã biết đúng cột nào cần nếm thì khỏi dò cả bảng.
   */
  if (cot.nhomTen !== undefined) {
    const giaTriNhom = [];
    for (const hang of rows.slice(1)) {
      if (!hang?.length || laHangTieuDe(hang, cot)) continue;
      const v = tachNhom(hang[cot.nhomTen]).ten;
      if (v) giaTriNhom.push(v);
    }
    const ra = giaTriNhom.length ? xepLoai(giaTriNhom, 'cột "nhom" ghi') : { vai: 'nhanKhau' };
    // Cột `nhom` có mặt thì đây KHÔNG phải bảng nhân khẩu thuần. Nếm không ra
    // thì nói thẳng là không biết, để người dùng chỉ định vai — chứ xếp vào
    // nhân khẩu là lẳng lặng đánh mất cả file dân tộc/tôn giáo.
    if (ra.vai === 'danToc' || ra.vai === 'tonGiao') return ra;
    return {
      vai: '',
      dauHieu:
        'có cột "nhom" nhưng không nhận ra là dân tộc hay tôn giáo — chỉ định vai cho file này',
    };
  }

  /**
   * DẠNG CHUẨN TỪ 8/2026: y hệt bảng nhân khẩu, thêm dân tộc / tôn giáo ở cột
   * cuối của TỪNG DÒNG. Ở dạng này hàng tiêu đề không mang giá trị nào cả, nên
   * phải nếm chính các dòng dữ liệu.
   */
  const giaTriDong = [];
  const daBiDung = new Set(Object.values(cot));
  let daThu = 0;
  for (const hang of rows.slice(1)) {
    if (!hang?.length || laHangTieuDe(hang, cot)) continue;
    if (++daThu > 200) break;
    for (let c = 0; c < hang.length; c++) {
      if (daBiDung.has(c)) continue;
      // Bỏ mã đứng đầu ("01-Kinh") kể cả khi cột không mang tiêu đề `nhom` —
      // có bản kết xuất giữ mã mà bỏ trống tên cột.
      const v = tachNhom(hang[c]).ten;
      if (v && VON_TU_GIA_TRI.has(nhan(v))) giaTriDong.push(v);
    }
  }
  // Đòi phủ quá nửa số dòng đã thử: vài ô trùng từ vựng là ngẫu nhiên, cả cột
  // trùng mới là cột giá trị.
  if (daThu && giaTriDong.length >= daThu * 0.5) {
    return xepLoai(giaTriDong, 'mỗi dòng ghi');
  }

  const giaTriKhoi = [];
  for (const [i, hang] of rows.entries()) {
    if (!hang.length) continue;
    if (i === 0 || laHangTieuDe(hang, cot)) {
      const v = oCuoi(hang);
      if (v) giaTriKhoi.push(v);
    }
  }

  if (!giaTriKhoi.length) {
    return { vai: 'nhanKhau', dauHieu: 'có cột cha/mẹ, không có cột giá trị thêm' };
  }

  return xepLoai(giaTriKhoi, 'mỗi khối ghi');
}

/**
 * Đống giá trị đọc được là dân tộc hay tôn giáo?
 *
 * Đếm phiếu chứ không xét giá trị đầu tiên: "Khác", "Không" nằm ở cả hai bên,
 * còn một ô lẻ đọc nhầm thì không lật được cả bảng.
 */
function xepLoai(giaTri, moTa) {
  let diemTonGiao = 0;
  let diemDanToc = 0;
  for (const v of giaTri) {
    const k = nhan(v);
    if (TRUNG_TINH.has(k)) continue;
    if (TON_GIAO.has(k)) diemTonGiao++;
    if (DAN_TOC.has(k)) diemDanToc++;
  }

  if (!diemTonGiao && !diemDanToc) {
    return { vai: 'nhanKhau', dauHieu: 'có cột cha/mẹ, không có cột giá trị thêm' };
  }

  const vd = [...new Set(giaTri)].slice(0, 3).join(', ');
  if (diemTonGiao > diemDanToc) return { vai: 'tonGiao', dauHieu: `${moTa} tôn giáo: ${vd}` };
  if (diemDanToc > diemTonGiao) return { vai: 'danToc', dauHieu: `${moTa} dân tộc: ${vd}` };
  return {
    vai: '',
    dauHieu: `có giá trị (${vd}) nhưng không nhận ra là dân tộc hay tôn giáo`,
  };
}

export function tenVai(vai) {
  return VAI[vai] ?? vai;
}
