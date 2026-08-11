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
 * Trong <w:rPr>, lược đồ OOXML quy định thứ tự các thẻ con. <w:highlight> phải
 * đứng trước những thẻ này, nếu không Word có thể coi tài liệu là hỏng.
 */
const AFTER_HIGHLIGHT = new Set([
  'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign',
  'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath',
]);

function setHighlight(run, color) {
  const doc = run.ownerDocument;
  let rPr = childByTag(run, 'w:rPr');
  if (!rPr) {
    rPr = doc.createElement('w:rPr');
    run.insertBefore(rPr, run.firstChild); // <w:rPr> phải là con đầu tiên của <w:r>
  }
  const existing = childByTag(rPr, 'w:highlight');
  if (existing) rPr.removeChild(existing);

  const el = doc.createElement('w:highlight');
  el.setAttribute('w:val', color);

  let before = null;
  for (let n = rPr.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && AFTER_HIGHLIGHT.has(n.nodeName)) {
      before = n;
      break;
    }
  }
  rPr.insertBefore(el, before); // before = null nghĩa là chèn vào cuối
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

/**
 * Thay đoạn [start, end) trong bản đồ bằng `replacement`.
 *
 * Mặc định: toàn bộ nội dung mới dồn vào node ĐẦU TIÊN mà vùng thay thế chạm
 * tới, nên thừa hưởng đúng định dạng của node đó. Các node còn lại trong vùng
 * bị cắt rỗng nhưng vẫn tồn tại, giữ nguyên cấu trúc XML.
 *
 * Nếu có `highlight`: phải TÁCH RUN thành ba phần — [đầu][phần bôi màu][đuôi].
 * Nguyên nhân: nhãn và vùng chấm thường nằm chung một run, ví dụ cả chuỗi
 * "1. Họ tên: ................" là một <w:r> duy nhất. Nếu bôi màu cả run thì
 * nhãn cũng bị tô theo. Tách run đảm bảo chỉ mỗi token được tô.
 */
export function spliceText(map, start, end, replacement, highlight = null) {
  let placed = false;

  for (const n of map.nodes) {
    if (n.end <= start || n.start >= end) continue; // không giao nhau
    const value = nodeText(n.el);
    const from = Math.max(0, start - n.start);
    const to = Math.min(value.length, end - n.start);

    const run = n.el.parentNode;
    const canSplit = highlight && !placed && run && run.nodeName === 'w:r' && run.parentNode;

    if (canSplit) {
      setNodeText(n.el, value.slice(0, from));

      const marked = cloneRunWithText(run, replacement);
      setHighlight(marked, highlight);
      run.parentNode.insertBefore(marked, run.nextSibling);

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
    if (spliceText(map, e.start, e.end, e.replacement, e.highlight)) applied++;
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
