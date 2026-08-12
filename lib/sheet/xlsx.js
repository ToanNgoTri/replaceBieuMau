/**
 * Đọc .xlsx (Excel / OOXML) thành mảng hàng × mảng ô, mọi ô là chuỗi.
 *
 * Chỉ đọc, không ghi — đủ dùng cho việc chuyển bảng kết xuất sang CSV. Ô ngày
 * tháng được trả về dạng DD/MM/YYYY thay vì số serial.
 */
import PizZip from 'pizzip';

/** Các numFmtId dựng sẵn mang nghĩa ngày/giờ theo lược đồ OOXML. */
const NGAY_DUNG_SAN = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

const THUC_THE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function giaiMa(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
    if (THUC_THE[e]) return THUC_THE[e];
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
  });
}

/** "AB" → 27 (số thứ tự cột, đếm từ 0). */
function chiSoCot(chu) {
  let n = 0;
  for (const c of chu) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Serial ngày của Excel → DD/MM/YYYY. Mốc 1899-12-30 (hệ 1900). */
export function serialSangNgay(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  const hai = (n) => String(n).padStart(2, '0');
  return `${hai(d.getUTCDate())}/${hai(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Bảng tra: chỉ số style (cellXfs) → có phải định dạng ngày không. */
function docStyleNgay(zip) {
  const xml = zip.file('xl/styles.xml')?.asText();
  if (!xml) return [];

  const tuChe = new Map();
  for (const m of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    // Bỏ phần trong ngoặc kép rồi mới dò ký tự ngày, để "d" trong chuỗi văn
    // bản literal không bị tính là mã ngày.
    const ma = giaiMa(m[2]).replace(/"[^"]*"/g, '');
    tuChe.set(+m[1], /[dmyDMY]/.test(ma) && !/^[^dmyDMY]*$/.test(ma));
  }

  const khoiXfs = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  return [...khoiXfs.matchAll(/<xf\b([^>]*)/g)].map((m) => {
    const id = +(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    return NGAY_DUNG_SAN.has(id) || tuChe.get(id) === true;
  });
}

function docChuoiChung(zip) {
  const xml = zip.file('xl/sharedStrings.xml')?.asText();
  if (!xml) return [];
  const out = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Một <si> có thể vỡ thành nhiều <r><t>, nối lại thành một chuỗi.
    out.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => giaiMa(t[1])).join(''));
  }
  return out;
}

/**
 * @param {Buffer} buffer nội dung file .xlsx
 * @returns {string[][]} mảng hàng; ô trống là chuỗi rỗng
 */
export function docXlsx(buffer) {
  const zip = new PizZip(buffer);
  const sst = docChuoiChung(zip);
  const styleNgay = docStyleNgay(zip);

  const tenSheet = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!tenSheet) throw new Error('Không tìm thấy worksheet trong file .xlsx');
  const xml = zip.file(tenSheet).asText();

  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    const cells = [];
    for (const cm of (rm[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const thuocTinh = cm[1];
      const noiDung = cm[2] ?? '';
      const cot = chiSoCot(thuocTinh.match(/r="([A-Z]+)/)?.[1] ?? '');
      const kieu = thuocTinh.match(/t="([^"]*)"/)?.[1] ?? 'n';
      const style = +(thuocTinh.match(/s="(\d+)"/)?.[1] ?? -1);

      let giaTri = '';
      if (kieu === 'inlineStr') {
        giaTri = [...noiDung.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => giaiMa(t[1])).join('');
      } else {
        const v = noiDung.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v != null) {
          if (kieu === 's') giaTri = sst[+v] ?? '';
          else if (kieu === 'b') giaTri = v === '1' ? 'TRUE' : 'FALSE';
          else if (styleNgay[style] && v !== '' && !isNaN(+v)) giaTri = serialSangNgay(+v);
          else giaTri = giaiMa(v);
        }
      }

      if (cot >= 0) {
        while (cells.length < cot) cells.push('');
        cells[cot] = giaTri;
      } else {
        cells.push(giaTri);
      }
    }
    rows.push(cells);
  }
  return rows;
}
