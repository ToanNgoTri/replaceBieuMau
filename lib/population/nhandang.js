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
import { nhan } from './fields.js';

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

  let diemTonGiao = 0;
  let diemDanToc = 0;
  for (const v of giaTriKhoi) {
    const k = nhan(v);
    if (TRUNG_TINH.has(k)) continue;
    if (TON_GIAO.has(k)) diemTonGiao++;
    if (DAN_TOC.has(k)) diemDanToc++;
  }

  if (!diemTonGiao && !diemDanToc) {
    return { vai: 'nhanKhau', dauHieu: 'có cột cha/mẹ, không có cột giá trị thêm' };
  }

  const vd = [...new Set(giaTriKhoi)].slice(0, 3).join(', ');
  if (diemTonGiao > diemDanToc) return { vai: 'tonGiao', dauHieu: `mỗi khối ghi tôn giáo: ${vd}` };
  if (diemDanToc > diemTonGiao) return { vai: 'danToc', dauHieu: `mỗi khối ghi dân tộc: ${vd}` };
  return {
    vai: '',
    dauHieu: `có giá trị (${vd}) nhưng không nhận ra là dân tộc hay tôn giáo`,
  };
  

}

export function tenVai(vai) {
  return VAI[vai] ?? vai;
}
