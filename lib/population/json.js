/**
 * Xuất JSON — mặt kia của `csv.js`, cùng một đống bản ghi.
 *
 * CSV là để dán vào trình nhập dữ liệu của Supabase; JSON là để đưa thẳng cho
 * mã nguồn: `supabase.from('population').insert(require('./population.json'))`,
 * hay bất cứ script nào cần đọc lại kết quả mà không phải tự phân tích CSV.
 *
 * Hai quy ước, cùng nghĩa với `csv.js` để hai file không nói hai chuyện khác:
 *   • ô rỗng → `null` (vào CSDL là NULL, không phải chuỗi rỗng)
 *   • boolean giữ nguyên kiểu boolean, không đổi thành "true"/1
 *
 * Mảng các đối tượng, không phải NDJSON: file nhập của Supabase và
 * `JSON.parse` đều mong đợi một mảng.
 */

/** Bản ghi đã chuẩn hoá cho JSON: rỗng thành `null`, thứ tự khoá theo `cot`. */
function banGhiJson(b, cot) {
  const ra = {};
  for (const c of cot) {
    const v = b[c];
    ra[c] = v === '' || v === undefined ? null : v;
  }
  return ra;
}

/**
 * @param {object[]} banGhi
 * @param {string[]} cot thứ tự khoá — dùng chung với CSV cho dễ đối chiếu
 * @returns {string} JSON có thụt lề, xuống dòng bằng \n, UTF-8 không BOM
 */
export function taoJson(banGhi, cot) {
  return JSON.stringify(banGhi.map((b) => banGhiJson(b, cot)), null, 2) + '\n';
}
