/**
 * Ánh xạ giữa "văn bản phẳng của một đoạn" và các node <w:t> rời rạc trong XML.
 *
 * Word cắt một câu thành nhiều <w:r> một cách tùy tiện (do lịch sử gõ, kiểm tra
 * chính tả, bôi đậm...). Ví dụ "TRƯỞNG CÔNG AN ……" có thể nằm trong 4 node:
 *
 *   <w:r><w:t>TRƯỞNG </w:t></w:r>
 *   <w:r><w:t>CÔNG</w:t></w:r>
 *   <w:r><w:t> AN </w:t></w:r>
 *   <w:r><w:t>……</w:t></w:r>
 *
 * Nếu tìm-thay trên từng node sẽ trượt. Cách làm ở đây: ghép thành một chuỗi
 * phẳng để so khớp, giữ bảng offset để ghi ngược lại đúng node.
 *
 * Ta KHÔNG gộp run lại với nhau — gộp run là thao tác phá hủy, làm mất ranh giới
 * định dạng. Chỉ ghi đè phần text, mọi thuộc tính <w:rPr>/<w:pPr> giữ nguyên.
 */

/** Đọc text của một node <w:t>. */
function nodeText(el) {
  let s = '';
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3 || n.nodeType === 4) s += n.nodeValue;
  }
  return s;
}

/** Ghi text vào một node <w:t>, tự bật xml:space khi cần giữ khoảng trắng. */
function setNodeText(el, value) {
  while (el.firstChild) el.removeChild(el.firstChild);
  if (value.length > 0) {
    el.appendChild(el.ownerDocument.createTextNode(value));
  }
  if (value === '' || /^[\s ]|[\s ]$/.test(value)) {
    el.setAttribute('xml:space', 'preserve');
  }
}

/**
 * Các nhánh phải bỏ qua khi gom text của một đoạn:
 *
 *  w:p              đoạn lồng bên trong textbox — được xử lý như một đoạn riêng,
 *                   nếu gom vào đây sẽ bị đếm hai lần và text dính vào nhau
 *  mc:Fallback      bản dự phòng cho Word đời cũ, trùng nội dung với mc:Choice
 *  w:instrText      mã lệnh của field (PAGE, REF...), không phải nội dung
 *  w:delText        text đã bị xóa trong chế độ theo dõi thay đổi
 */
const SKIP_SUBTREE = new Set(['w:p', 'mc:Fallback', 'w:instrText', 'w:delText']);

/**
 * Dựng bản đồ text cho một đoạn <w:p>.
 * @returns {{ text: string, nodes: Array<{el: Element, start: number, end: number}> }}
 */
export function buildTextMap(paragraph) {
  const nodes = [];
  let text = '';

  const walk = (parent) => {
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const tag = n.nodeName;
      if (SKIP_SUBTREE.has(tag)) continue;
      if (tag === 'w:t') {
        const value = nodeText(n);
        nodes.push({ el: n, start: text.length, end: text.length + value.length });
        text += value;
        continue;
      }
      walk(n);
    }
  };
  walk(paragraph);

  return { text, nodes };
}

function childByTag(parent, tag) {
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && n.nodeName === tag) return n;
  }
  return null;
}

/**
 * Thứ tự các thẻ con trong <w:rPr> do lược đồ OOXML quy định. Chèn sai thứ tự
 * thì Word có thể coi tài liệu là hỏng, nên phải tra bảng này để biết chèn vào
 * trước thẻ nào.
 */
const RPR_ORDER = [
  'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps',
  'w:strike', 'w:dstrike', 'w:outline', 'w:shadow', 'w:emboss', 'w:imprint',
  'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing',
  'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect',
  'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang',
  'w:eastAsianLayout', 'w:specVanish', 'w:oMath',
];

/** Thêm hoặc thay một thẻ trong <w:rPr>, đặt đúng vị trí lược đồ yêu cầu. */
function upsertRunProp(run, tag, attrs) {
  const doc = run.ownerDocument;
  let rPr = childByTag(run, 'w:rPr');
  if (!rPr) {
    rPr = doc.createElement('w:rPr');
    run.insertBefore(rPr, run.firstChild); // <w:rPr> phải là con đầu tiên của <w:r>
  }

  const existing = childByTag(rPr, tag);
  if (existing) rPr.removeChild(existing);

  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);

  const rank = RPR_ORDER.indexOf(tag);
  let before = null;
  for (let n = rPr.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    const r = RPR_ORDER.indexOf(n.nodeName);
    if (r > rank) {
      before = n;
      break;
    }
  }
  rPr.insertBefore(el, before); // before = null nghĩa là chèn vào cuối
}

function setHighlight(run, color) {
  upsertRunProp(run, 'w:highlight', { 'w:val': color });
}

/** Đặt cỡ chữ. Đơn vị của OOXML là nửa point, nên 13pt ghi là 26. */
function setFontSize(run, halfPoints) {
  upsertRunProp(run, 'w:sz', { 'w:val': String(halfPoints) });
  upsertRunProp(run, 'w:szCs', { 'w:val': String(halfPoints) });
}

/** Nhân bản một <w:r> — giữ nguyên <w:rPr> — với nội dung chữ mới. */
function cloneRunWithText(run, text) {
  const doc = run.ownerDocument;
  const clone = run.cloneNode(false);
  const rPr = childByTag(run, 'w:rPr');
  if (rPr) clone.appendChild(rPr.cloneNode(true));
  const t = doc.createElement('w:t');
  t.setAttribute('xml:space', 'preserve');
  if (text.length) t.appendChild(doc.createTextNode(text));
  clone.appendChild(t);
  return clone;
}

/** Chuỗi hóa <w:rPr> để so sánh hai run có cùng định dạng hay không. */
function runProps(run) {
  const rPr = childByTag(run, 'w:rPr');
  return rPr ? String(rPr) : '';
}

/** Tìm <w:r> chứa ký tự ở vị trí `offset` trong văn bản phẳng của đoạn. */
function runAt(map, offset) {
  if (offset == null) return null;
  const node = map.nodes.find((n) => offset >= n.start && offset < n.end);
  const run = node && node.el.parentNode;
  return run && run.nodeName === 'w:r' ? run : null;
}

/**
 * Thay đoạn [start, end) trong bản đồ bằng `replacement`.
 *
 * @param {object} opts
 * @param {string} [opts.highlight]  màu bôi nền cho phần thay thế
 * @param {number} [opts.styleAt]    vị trí lấy định dạng — thường là đầu nhãn
 * @param {number} [opts.fontSize]   ép cỡ chữ, đơn vị nửa point (26 = 13pt)
 *
 * Có hai lý do phải TÁCH RUN thay vì ghi đè tại chỗ:
 *
 * 1. Bôi màu. Nhãn và vùng chấm hay nằm chung một run — cả chuỗi
 *    "1. Họ tên: ......" có thể là một <w:r> duy nhất. Tô cả run thì nhãn cũng
 *    bị tô theo, nên phải cắt thành [nhãn][phần bôi màu][đuôi].
 *
 * 2. Vùng chấm có định dạng khác nhãn. Người soạn mẫu thường gõ dấu chấm nhỏ
 *    hơn để nhét vừa dòng — "1. Họ tên" cỡ 13pt nhưng dãy chấm chỉ 10pt, có chỗ
 *    còn 9pt. Ghi đè tại chỗ thì chữ điền vào thừa hưởng cỡ của dấu chấm, ra
 *    kết quả chỗ to chỗ bé. Lấy định dạng ở `styleAt` (đầu nhãn) mới đúng.
 *
 * Khi định dạng của nhãn và vùng chấm vốn đã giống nhau và không cần bôi màu,
 * vẫn ghi đè tại chỗ để không sinh thêm run thừa.
 */
export function spliceText(map, start, end, replacement, opts = {}) {
  const { highlight = null, styleAt = null, fontSize = null } = opts;
  const styleRun = runAt(map, styleAt);
  let placed = false;

  for (const n of map.nodes) {
    if (n.end <= start || n.start >= end) continue; // không giao nhau
    const value = nodeText(n.el);
    const from = Math.max(0, start - n.start);
    const to = Math.min(value.length, end - n.start);

    const run = n.el.parentNode;
    const splittable = !placed && run && run.nodeName === 'w:r' && run.parentNode;
    const differentStyle = styleRun && styleRun !== run && runProps(styleRun) !== runProps(run);

    if (splittable && (highlight || fontSize || differentStyle)) {
      setNodeText(n.el, value.slice(0, from));

      const marked = cloneRunWithText(styleRun ?? run, replacement);
      if (fontSize) setFontSize(marked, fontSize);
      if (highlight) setHighlight(marked, highlight);
      run.parentNode.insertBefore(marked, run.nextSibling);

      // Phần đuôi giữ định dạng CŨ của vùng chấm, không lấy theo nhãn.
      const tail = value.slice(to);
      if (tail) {
        run.parentNode.insertBefore(cloneRunWithText(run, tail), marked.nextSibling);
      }
      placed = true;
      continue;
    }

    setNodeText(n.el, value.slice(0, from) + (placed ? '' : replacement) + value.slice(to));
    placed = true;
  }

  return placed;
}

/**
 * Áp nhiều phép thay thế lên cùng một đoạn.
 * Chạy từ CUỐI về ĐẦU để các offset phía trước không bị xê dịch.
 */
export function applyEdits(map, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let applied = 0;
  for (const e of ordered) {
    if (spliceText(map, e.start, e.end, e.replacement, e)) applied++;
  }
  return applied;
}

/** Lấy toàn bộ đoạn <w:p> của một part. */
export function listParagraphs(doc) {
  const out = [];
  const list = doc.getElementsByTagName('w:p');
  for (let i = 0; i < list.length; i++) out.push(list[i]);
  return out;
}
