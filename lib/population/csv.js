/**
 * Xuất CSV cho trình nhập dữ liệu của Supabase.
 *
 * Ba quy ước bắt buộc để Supabase hiểu đúng:
 *   • ô rỗng KHÔNG bọc nháy  → vào CSDL là NULL (bọc nháy sẽ thành chuỗi rỗng)
 *   • boolean viết true/false, không viết 1/0
 *   • ngắt dòng bằng \n, mã hoá UTF-8 không BOM
 */

/** Bọc nháy khi ô có dấu phẩy, nháy kép, xuống dòng, hoặc khoảng trắng ở biên. */
function oCsv(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return /[",\n\r]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function taoCsv(banGhi, cot) {
  const dong = [cot.join(',')];
  for (const b of banGhi) dong.push(cot.map((c) => oCsv(b[c])).join(','));
  return dong.join('\n') + '\n';
}

/** Chia bản ghi thành từng mẻ để file nhập không quá lớn. */
export function chiaMe(banGhi, kichThuoc) {
  if (!kichThuoc || kichThuoc >= banGhi.length) return [banGhi];
  const me = [];
  for (let i = 0; i < banGhi.length; i += kichThuoc) me.push(banGhi.slice(i, i + kichThuoc));
  return me;
}
