/**
 * Đọc .ods (LibreOffice / OpenDocument) thành mảng hàng × mảng ô, mọi ô là chuỗi.
 *
 * ── Vì sao có tuỳ chọn `doiNgayThang` ──────────────────────────────────────
 * File .ods trong luồng này là file .xlsx kết xuất từ hệ thống dân cư rồi mở
 * bằng LibreOffice và lưu lại. Lúc mở, LibreOffice đọc cột "Ngày sinh" theo
 * locale Mỹ: chuỗi 11/09/2010 (11 tháng 9) bị hiểu thành 9 tháng 11 và ghi
 * xuống `office:date-value="2010-09-11"`.
 *
 * Chỉ những ô có ngày ≤ 12 mới lọt qua kiểu ngày, phần còn lại nằm nguyên dạng
 * chuỗi DD/MM/YYYY. Nói cách khác: ô kiểu `date` trong .ods là ô ĐÃ BỊ đảo
 * ngày ↔ tháng, ô kiểu chuỗi thì còn đúng.
 *
 * Đối chiếu 6.305 ô kiểu ngày với chính số serial trong `ton giao.xlsx` (bản
 * kết xuất gốc, chưa qua LibreOffice): 6.305/6.305 khớp sau khi đảo lại, 0 ô
 * khớp nếu để nguyên. Với 7.146 ô kiểu chuỗi thì ngược lại — khớp 100% khi để
 * nguyên. Đó là căn cứ để bật `doiNgayThang` cho file .ods.
 */
import PizZip from 'pizzip';

const THUC_THE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function giaiMa(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
    if (THUC_THE[e]) return THUC_THE[e];
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
  });
}

/** Số ô/hàng lặp lớn hơn ngưỡng này là phần đệm rỗng cuối bảng, không phải dữ liệu. */
const NGUONG_LAP = 64;

/** "2010-09-11" → "11/09/2010", hoặc "09/11/2010" nếu đảo lại ngày ↔ tháng. */
function ngayTuIso(iso, doi) {
  const [nam, thang, ngay] = iso.slice(0, 10).split('-');
  // Chỉ đảo được khi phần "ngày" ≤ 12, tức nó thật sự là tháng bị đặt nhầm chỗ.
  return doi && +ngay <= 12 ? `${thang}/${ngay}/${nam}` : `${ngay}/${thang}/${nam}`;
}

/**
 * @param {Buffer} buffer nội dung file .ods
 * @param {object} [opts]
 * @param {boolean} [opts.doiNgayThang] đảo lại ngày ↔ tháng ở ô kiểu ngày
 * @param {object} [opts.thongKe] object được ghi thêm `oNgayDaDoi`
 * @param {number} [opts.gioiHan] chỉ đọc bấy nhiêu hàng đầu — dùng để ngó nhận dạng
 * @returns {string[][]} mảng hàng; ô trống là chuỗi rỗng
 */
export function docOds(buffer, { doiNgayThang = false, thongKe = {}, gioiHan = 0 } = {}) {
  // .ods là ZIP; content.xml có thể vài chục MB nên giải nén thẳng, không dựng
  // cây DOM.
  const xml = giaiNenContent(buffer);

  const dau = xml.indexOf('<table:table ');
  if (dau < 0) throw new Error('Không tìm thấy bảng trong file .ods');
  const than = xml.slice(dau, xml.indexOf('</table:table>', dau));

  thongKe.oNgayDaDoi = 0;
  const rows = [];

  for (const rm of than.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
    const lapHang = +(rm[1].match(/table:number-rows-repeated="(\d+)"/)?.[1] ?? 1);
    const cells = [];

    for (const cm of (rm[2] ?? '').matchAll(
      /<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g,
    )) {
      const thuocTinh = cm[1];
      const noiDung = cm[2] ?? '';
      const lapCot = +(thuocTinh.match(/table:number-columns-repeated="(\d+)"/)?.[1] ?? 1);

      const ngayIso = thuocTinh.match(/office:date-value="([^"]*)"/)?.[1];
      const soHoc = thuocTinh.match(/office:value="([^"]*)"/)?.[1];
      const chu = [...noiDung.matchAll(/<text:p\b[^>]*(?:\/>|>([\s\S]*?)<\/text:p>)/g)]
        .map((t) => giaiMa((t[1] ?? '').replace(/<[^>]+>/g, '')).trim())
        .filter(Boolean)
        .join(' ');

      let giaTri;
      if (ngayIso) {
        giaTri = ngayTuIso(ngayIso, doiNgayThang);
        if (doiNgayThang) thongKe.oNgayDaDoi++;
      } else {
        // Ô số giữ nguyên `office:value`: chuỗi hiển thị đã bị làm tròn hoặc
        // cắt số 0 đầu, còn `office:value` là giá trị thật.
        giaTri = soHoc ?? chu;
      }

      // Đuôi mỗi hàng là một ô rỗng lặp hàng nghìn lần cho đủ chiều rộng bảng.
      if (lapCot > NGUONG_LAP && !giaTri) break;
      for (let i = 0; i < lapCot; i++) cells.push(giaTri);
    }

    if (lapHang > NGUONG_LAP && cells.every((c) => !c)) break;
    for (let i = 0; i < lapHang; i++) rows.push(cells);
    if (gioiHan && rows.length >= gioiHan) break;
  }

  return rows;
}

function giaiNenContent(buffer) {
  const file = new PizZip(buffer).file('content.xml');
  if (!file) throw new Error('File .ods không có content.xml');
  return file.asText();
}
