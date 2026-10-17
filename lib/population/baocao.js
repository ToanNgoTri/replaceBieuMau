/**
 * BẢN BÁO CÁO SAU MỖI LƯỢT CHUYỂN ĐỔI.
 *
 * Đây là thứ để soát: bao nhiêu dòng bị bỏ và bỏ vì lý do gì, bao nhiêu người
 * không suy được quan hệ, bao nhiêu ô ngày phải sửa. Số nào bất thường là biết
 * ngay bản kết xuất có vấn đề, trước khi đẩy CSV lên Supabase.
 *
 * Dòng lệnh in ra terminal, giao diện vừa in ra terminal vừa hiện nguyên khối
 * này trong trang — cùng một hàm, nên hai bên không thể nói hai chuyện khác nhau.
 */

const so = (n) => String(n ?? 0).padStart(6);

/** Bảng đếm quan hệ, xếp nhiều trước, hai cột cho gọn màn hình. */
function bangQuanHe(quanHe = {}) {
  const muc = Object.entries(quanHe)
    .sort((a, b) => b[1] - a[1])
    .map(([ten, n]) => `${so(n)} ${ten}`);
  const dong = [];
  for (let i = 0; i < muc.length; i += 2) {
    dong.push('  ' + muc[i].padEnd(24) + (muc[i + 1] ?? ''));
  }
  return dong.join('\n');
}

/** Mục "Đã xoá" — chỉ in khi lượt chạy có bảng nhân khẩu đã xoá. */
function baoCaoXoa(t) {
  if (!t.xoaDoc) return '';
  return `
Nhân khẩu đã xoá (DELETED = true)
  ${so(t.xoaDoc)} dòng trong bảng đã xoá
  ${so(t.daXoa)} người ghi vào kết quả, ${t.quanHeXoa} người suy được quan hệ
  ${so(t.xoaVanDangO)} người đã xoá nhưng vẫn đang ở (hộ khác) — giữ bản ghi đang ở
  ${so(t.xoaTrung)} dòng xoá lặp cùng một người — giữ dòng đầu${
    t.xoaThieuCccd ? `\n  ${so(t.xoaThieuCccd)} dòng không có CCCD — bỏ` : ''
  }
`;
}

/**
 * @param {object} kq kết quả của `chayChuyenDoi`
 * @param {boolean} doiNgayThang có bật sửa lỗi ngày của LibreOffice không
 * @returns {string} khối chữ nhiều dòng, in thẳng ra terminal hoặc thẻ <pre>
 */
export function banBaoCao(kq, { doiNgayThang = true } = {}) {
  const { banGhi, thongKe: t, thongKeNgay, tenFile, outDir } = kq;
  const daSuy = Object.values(t.quanHe ?? {}).reduce((a, b) => a + b, 0);

  return `
Nguồn
  ${so(t.hangDoc)} dòng dữ liệu (${t.hangTieuDeLap} hàng tiêu đề lặp đã bỏ)
  ${so(t.thieuCccd)} dòng không có CCCD — bỏ, vì CCCD là khoá chính
  ${so(t.trungCccd)} dòng trùng CCCD — giữ dòng đầu

Ghép thêm
  ${so(t.coDanToc)} người có dân tộc${t.macDinhKinh ? `, ${t.macDinhKinh} người mặc định KINH` : ''}
  ${so(t.coTonGiao)} người có tôn giáo
  ${so(t.danTocThua ?? 0)} + ${t.tonGiaoThua ?? 0} người ở file lọc không thấy trong bảng nhân khẩu
${baoCaoXoa(t)}
Quan hệ với chủ hộ — suy từ tên cha mẹ trong ${t.soHo} hộ
${bangQuanHe(t.quanHe)}
  ${so(banGhi.length - (t.daXoa ?? 0) - daSuy)} để trống (không đủ căn cứ suy ra)
  ${so(t.hoTheoHoKhau)} hộ xác định chủ hộ bằng CCCD trong file hộ khẩu
  ${so(t.hoTheoTen)} hộ dò chủ hộ theo tên
  ${so(t.hoChuHoVang)} hộ chủ hộ đã đi khỏi hộ — vẫn suy được vợ/con của người đó
  ${so(t.hoKhongBietChuHo)} hộ không xác định được chủ hộ${
    t.khongSoHo ? `, ${t.khongSoHo} người không có số hộ` : ''
  }
${
  doiNgayThang && thongKeNgay?.oNgayDaDoi
    ? `\nSửa lỗi LibreOffice\n  ${so(thongKeNgay.oNgayDaDoi)} ô kiểu ngày đã đảo lại ngày ↔ tháng\n`
    : ''
}
Chưa đủ
  ${so(t.khongNgaySinh)} người thiếu / sai ngày sinh
  ${so(t.khongGioiTinh)} người không đọc được giới tính

Kết quả: ${banGhi.length} bản ghi${t.daXoa ? ` (${t.daXoa} đã xoá)` : ''} → ${outDir}
  ${tenFile.map((f) => `${f.ten} (${f.dong} dòng)`).join('\n  ')}
`;
}
