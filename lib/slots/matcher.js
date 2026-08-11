/**
 * Bộ nhận diện "ô trống" trong biểu mẫu.
 *
 * Nguyên tắc an toàn: engine CHỈ điền những ô khớp với khai báo trong
 * definitions.js. Mọi dòng chấm khác — "Họ tên: .........", "Ngày sinh: ....",
 * "Tội danh: ...." — không có khai báo nên không bao giờ bị đụng tới.
 * Đây là bảo đảm bằng thiết kế, không phải bằng kiểm tra lúc chạy.
 */

/** Các ký tự được coi là "dấu điền chỗ trống" trong biểu mẫu hành chính VN. */
const DOT = '.\\u2026\\u00b7\\u2024\\u2025_\\u0387';
const SP = '\\s\\u00a0';

/**
 * Một vùng trống hợp lệ phải có ÍT NHẤT 2 ký tự chấm.
 * Ngưỡng này để không nuốt nhầm dấu chấm cuối câu.
 * Bắt được mọi biến thể: "…..", ".............", "….……", "……..".
 */
export const FILLER = `(?=[${SP}]*(?:[${DOT}][${SP}]*){2,})[${DOT}${SP}]+`;

/**
 * Vùng trống kiểu ngày tháng: "…....../..…../.........." hoặc "......../....../20..."
 * Cũng khớp cả ô ngày gộp một chỗ trống duy nhất.
 */
export const FILLER_DATE = `(?=[${SP}]*[${DOT}])[${DOT}${SP}]+(?:\\/[${DOT}${SP}0-9]*){0,2}`;

function escapeLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Chuỗi neo cho phép khoảng trắng linh hoạt giữa các từ. */
function anchorSource(anchor) {
  if (anchor instanceof RegExp) return anchor.source;
  return anchor
    .trim()
    .split(/\s+/)
    .map(escapeLiteral)
    .join(`[${SP}]+`);
}

/** Biên dịch một khai báo slot thành RegExp có 2 nhóm: anchor và fill. */
export function compileSlot(slot) {
  const a = `(?<anchor>${anchorSource(slot.anchor)})`;
  const f = `(?<fill>${slot.filler ?? FILLER})`;
  const source = slot.position === 'before' ? `${f}${a}` : `${a}${f}`;
  const flags = 'gud' + (slot.caseSensitive ? '' : 'i');
  return new RegExp(source, flags);
}

const compiled = new WeakMap();
function regexFor(slot) {
  if (!compiled.has(slot)) compiled.set(slot, compileSlot(slot));
  return compiled.get(slot);
}

/** Độ ưu tiên: neo càng dài càng cụ thể, được xét trước. */
function specificity(slot) {
  return (
    (slot.priority ?? 0) * 1000 +
    (slot.anchor instanceof RegExp ? slot.anchor.source.length : slot.anchor.length)
  );
}

/**
 * Tìm mọi ô khớp trong một đoạn văn bản phẳng.
 *
 * Xử lý chồng lấn: "CÔNG AN ……" nằm bên trong "TRƯỞNG CÔNG AN ……".
 * Slot có neo dài hơn thắng, slot bị chồng lấn bị loại.
 *
 * @param {string} text  văn bản phẳng của đoạn
 * @param {Array}  slots danh sách khai báo slot đang bật
 * @returns {Array<{slot, fillStart, fillEnd, matchStart, matchEnd, anchorText}>}
 */
export function findSlots(text, slots) {
  const found = [];

  for (const slot of slots) {
    if (slot.requires && !slot.requires.test(text)) continue;

    const re = regexFor(slot);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      // Ràng buộc "phải nằm đầu dòng" — dùng cho khối tiêu đề, địa danh.
      // ignorePrefix cho phép bỏ qua phần đầu không mang nghĩa, ví dụ con dấu
      // "Mẫu M103 BH theo TT số 129/2026/TT-BCA" nằm chung đoạn với tên đơn vị.
      if (slot.atLineStart) {
        let before = text.slice(0, m.index);
        if (slot.ignorePrefix) before = before.replace(slot.ignorePrefix, '');
        if (before.trim() !== '') continue;
      }

      const fill = m.indices.groups.fill;
      const anchor = m.indices.groups.anchor;
      found.push({
        slot,
        matchStart: m.index,
        matchEnd: m.index + m[0].length,
        fillStart: fill[0],
        fillEnd: fill[1],
        anchorText: text.slice(anchor[0], anchor[1]),
      });
    }
  }

  // Neo cụ thể hơn được chọn trước; loại bỏ khớp bị chồng lấn.
  //
  // Xét chồng lấn theo VÙNG ĐIỀN chứ không theo cả cụm khớp. Neo chỉ là ngữ
  // cảnh nhận dạng, cái ta thực sự sửa là vùng chấm. Nhờ vậy nhiều slot dùng
  // chung một đoạn neo vẫn cùng hoạt động, miễn là chúng điền vào ô khác nhau:
  //
  //   "Bản án số ......... ngày ..../..../.... của TAND ..........."
  //              └ SOBANAN       └ ngày ban án       └ TANDBANAN
  //
  // Ngược lại, "CÔNG AN ……" và "TRƯỞNG CÔNG AN ……" trỏ vào cùng một ô nên
  // vẫn loại trừ nhau đúng như trước, và slot ưu tiên cao hơn thắng.
  found.sort((a, b) => specificity(b.slot) - specificity(a.slot) || a.matchStart - b.matchStart);

  const accepted = [];
  for (const cand of found) {
    const clash = accepted.some(
      (a) => cand.fillStart < a.fillEnd && a.fillStart < cand.fillEnd,
    );
    if (!clash) accepted.push(cand);
  }
  return accepted.sort((a, b) => a.fillStart - b.fillStart);
}

/**
 * Dựng chuỗi thay thế cho một ô đã khớp.
 * Tự khớp chữ HOA/thường theo neo: neo viết hoa toàn bộ thì giá trị cũng viết hoa.
 *
 * @param {object} hit              kết quả khớp từ findSlots
 * @param {object} opts
 * @param {string} [opts.value]    giá trị lấy từ hồ sơ đơn vị
 * @param {string} [opts.literal]  chuỗi cố định (token) chèn thẳng, bỏ qua value
 * @param {string} [opts.text]     văn bản đầy đủ của đoạn, dùng để canh khoảng trắng
 */
export function renderFill(hit, { value, literal = null, text = '' } = {}) {
  // Slot dạng "xóa trống": bỏ hẳn vùng chấm, không điền gì.
  // Ví dụ chỗ ký chỉ để "TRƯỞNG CÔNG AN", không kèm tên đơn vị.
  if (hit.slot.clear) {
    const next = text.slice(hit.fillEnd, hit.fillEnd + 1);
    // Giữ một khoảng trắng nếu ngay sau đó còn nội dung, ví dụ dấu chú thích.
    return next && !/\s/u.test(next) ? ' ' : '';
  }

  let out;

  if (literal != null) {
    // Slot dạng token: chèn chỗ giữ chỗ của docxtemplater để ppv2web điền sau.
    out = literal;
  } else {
    if (value == null || value === '') return null;
    out = String(value);
    // Khớp chữ hoa theo neo: "CÔNG AN" → giá trị viết hoa, "Công an" → giữ nguyên.
    const a = hit.anchorText;
    if (/\p{L}/u.test(a) && a === a.toUpperCase() && a !== a.toLowerCase()) {
      out = out.toUpperCase();
    }
  }

  if (hit.slot.position === 'before') return out;

  // Vùng chấm nuốt hết khoảng trắng ở cả hai đầu, nên phải đệm lại — nhưng chỉ
  // khi thật sự cần, để không sinh ra khoảng trắng thừa:
  //
  //   "TRƯỞNG CÔNG AN" + "……"        → cần đệm trái   → "TRƯỞNG CÔNG AN PHƯỜNG…"
  //   "/BC-"           + "……"        → không đệm      → "/BC-CAP"
  //   "Bản án số "     + "…… ngày"   → đã có sẵn dấu cách bên trái, cần đệm phải
  //   "Nơi cấp: "      + "……" hết dòng → không đệm phải
  const NO_PAD_LEFT = /[-/_\s]\s*$/u; // neo kết thúc bằng dấu nối hoặc đã có dấu cách
  const NO_PAD_RIGHT = /^[\s.,;:)(\][/]|^$/u; // sau ô là dấu câu, dấu ngoặc, hoặc hết đoạn

  const lead = NO_PAD_LEFT.test(hit.anchorText) ? '' : ' ';
  const trail = NO_PAD_RIGHT.test(text.slice(hit.fillEnd, hit.fillEnd + 1)) ? '' : ' ';

  return lead + out + trail;
}
