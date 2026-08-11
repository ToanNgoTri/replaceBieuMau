import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { loadDocx, listParts, readPart, writePart, saveDocx } from './zip.js';
import { buildTextMap, applyEdits, listParagraphs } from './text.js';
import { findSlots, renderFill } from '../slots/matcher.js';
import { enabledSlots, SLOTS } from '../slots/definitions.js';

const parser = new DOMParser();
const serializer = new XMLSerializer();

/**
 * Điền hồ sơ đơn vị vào một file .docx.
 *
 * @param {Buffer} buffer   nội dung file .docx gốc
 * @param {object} profile  hồ sơ đơn vị (xem lib/profile.js)
 * @param {object} options
 * @param {object} options.slotOverrides  bật/tắt slot theo id
 * @param {boolean} options.dryRun        chỉ dò, không ghi
 * @returns {{ buffer: Buffer|null, hits: Array, misses: Array }}
 */
export function fillDocx(buffer, profile, options = {}) {
  const { slotOverrides = {}, dryRun = false } = options;
  const slots = enabledSlots(slotOverrides);

  const zip = loadDocx(buffer);
  const hits = [];
  const misses = [];

  // Đếm số lần mỗi slot đã khớp, để slot khai báo *ByOrdinal chọn đúng trường.
  //
  //   scope 'document'  — khối tiêu đề có hai dòng "CÔNG AN": dòng đầu là cơ
  //                       quan cấp trên, dòng sau là đơn vị ban hành
  //   scope 'paragraph' — trong một câu có hai chữ "của TAND": lần đầu là tòa
  //                       ra bản án, lần sau là tòa ra quyết định thi hành án
  const docOrdinals = new Map();
  let parOrdinals = new Map();

  const ordinalOf = (slot) => {
    const store = slot.ordinalScope === 'paragraph' ? parOrdinals : docOrdinals;
    const n = store.get(slot.id) ?? 0;
    store.set(slot.id, n + 1);
    return n;
  };

  const pick = (list, i) => (list ? list[Math.min(i, list.length - 1)] : undefined);

  /** Chốt trường / token cho một lần khớp, có tính tới thứ tự xuất hiện. */
  const resolve = (slot) => {
    const i = ordinalOf(slot);
    const field = pick(slot.fieldByOrdinal, i) ?? slot.field;
    const token = pick(slot.tokenByOrdinal, i) ?? slot.token;
    const literal = slot.replacement ?? (token ? `{${token}}` : null);
    return { field, literal };
  };

  for (const part of listParts(zip)) {
    const doc = parser.parseFromString(readPart(zip, part), 'text/xml');
    let changed = false;

    for (const paragraph of listParagraphs(doc)) {
      const map = buildTextMap(paragraph);
      if (!map.text.trim()) continue;
      parOrdinals = new Map();

      const found = findSlots(map.text, slots);
      const edits = [];

      for (const hit of found) {
        const { field, literal } = resolve(hit.slot);
        const replacement = renderFill(hit, { value: profile[field], literal, text: map.text });
        if (replacement == null) continue; // trường bỏ trống → giữ nguyên dấu chấm
        edits.push({
          start: hit.fillStart,
          end: hit.fillEnd,
          replacement,
          highlight: hit.slot.highlight ?? null,
          // Lấy định dạng ở ĐẦU NHÃN, không phải ở vùng chấm liền kề.
          // Nhãn "1. Họ tên" cỡ 13pt nhưng dấu hai chấm và dãy chấm sau nó
          // thường bị gõ nhỏ hơn (10pt, có chỗ 9pt) để nhét vừa dòng.
          styleAt: hit.slot.position === 'before' ? hit.fillEnd : hit.matchStart,
          fontSize: coChuCho(replacement),
        });
        hits.push({
          part,
          slotId: hit.slot.id,
          field,
          before: map.text.slice(hit.matchStart, hit.matchEnd).trim(),
          after:
            hit.slot.position === 'before'
              ? (replacement + hit.anchorText).trim()
              : (hit.anchorText + replacement).trim(),
        });
      }

      // Chẩn đoán: đoạn còn ô trống mà lại nhắc tới đơn vị/cơ quan
      // → nhiều khả năng là biến thể chưa được khai báo.
      // Xét với TOÀN BỘ slot (kể cả slot đang tắt) để không báo nhầm những ô
      // mà người dùng chủ động không điền, ví dụ số văn bản.
      if (isSuspectedMiss(map.text, findSlots(map.text, SLOTS))) {
        misses.push({ part, text: map.text.replace(/\s+/g, ' ').trim().slice(0, 160) });
      }

      if (edits.length && !dryRun) {
        applyEdits(map, edits);
        changed = true;
      }
    }

    if (changed) writePart(zip, part, serializer.serializeToString(doc));
  }

  return { buffer: dryRun ? null : saveDocx(zip), hits, misses };
}

/**
 * Cỡ chữ cho phần được điền vào, theo chuẩn trình bày văn bản hành chính.
 * Đơn vị của OOXML là nửa point.
 */
const CO_CHU_IN_HOA = 26; // 13pt — tên cơ quan, ký hiệu văn bản
const CO_CHU_THUONG = 28; // 14pt — nội dung

/**
 * Chọn cỡ chữ cho một chuỗi sắp chèn.
 *
 * Chỗ giữ chỗ `{HOTEN}` tuy viết hoa nhưng giá trị thật sẽ là "Ngô Quang Tâm",
 * tức chữ thường — nên luôn tính là 14pt, không xét theo hình dạng của token.
 *
 * @returns {number|null} null nghĩa là không chèn chữ nào, khỏi đụng cỡ chữ
 */
function coChuCho(replacement) {
  const text = replacement.trim();
  if (!text) return null; // slot dạng xóa trống
  if (text.includes('{')) return CO_CHU_THUONG; // token
  const hoa = /\p{L}/u.test(text) && text === text.toUpperCase();
  return hoa ? CO_CHU_IN_HOA : CO_CHU_THUONG;
}

/** Từ khóa gợi ý đoạn đó là ô ngữ cảnh đơn vị chứ không phải ô thông tin công dân. */
const CONTEXT_HINT =
  /(công an|cơ quan|ủy ban|UBND|THAHS|kính gửi|nơi nhận|trưởng|giám thị|chủ tịch)/iu;
const HAS_FILLER = /[.…]{3,}/u;

function isSuspectedMiss(text, found) {
  if (!HAS_FILLER.test(text)) return false;
  if (!CONTEXT_HINT.test(text)) return false;
  return found.length === 0;
}
