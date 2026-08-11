/**
 * KHAI BÁO Ô NGỮ CẢNH — đây là toàn bộ "tri thức nghiệp vụ" của app.
 *
 * Muốn hỗ trợ một họ biểu mẫu mới (Tòa án, Viện kiểm sát, UBND...), chỉ cần
 * thêm slot vào đây. KHÔNG cần sửa engine.
 *
 * Mỗi slot mô tả: neo (phần chữ cố định) + vị trí vùng trống so với neo.
 *
 *   anchor        chuỗi hoặc RegExp — phần chữ cố định nhận diện ô
 *   position      'after' (mặc định) — vùng trống nằm sau neo
 *                 'before'           — vùng trống nằm trước neo
 *   field         tên trường trong hồ sơ đơn vị sẽ được điền vào
 *   fieldByOrdinal  mảng tên trường theo thứ tự xuất hiện trong tài liệu;
 *                 giá trị cuối lặp lại cho các lần sau
 *   clear         true = xóa vùng chấm, không điền gì vào
 *   token         chèn chỗ giữ chỗ docxtemplater `{TÊN}` thay vì giá trị hồ sơ
 *   replacement   chuỗi cố định để chèn (dùng cho token ghép, ví dụ ngày tháng)
 *   filler        RegExp thay cho vùng chấm mặc định (ví dụ ô ngày "…/…/…")
 *   highlight     màu bôi nền, ví dụ 'yellow'
 *   atLineStart   chỉ khớp khi neo nằm đầu đoạn (dùng cho khối tiêu đề)
 *   ignorePrefix  RegExp — phần đầu đoạn được bỏ qua khi xét atLineStart
 *   requires      RegExp — đoạn phải chứa mẫu này thì mới xét
 *   priority      số nguyên, cao hơn = ưu tiên hơn khi chồng lấn
 *   caseSensitive phân biệt hoa thường (mặc định: không)
 *   default       false = tắt sẵn, người dùng tự bật
 */

import { TOKEN_SLOTS } from './tokens.js';

/** Dấu chú thích cuối ô: "(1)", "( 2 )", "()" — phải coi là phần của neo,
 *  nếu không vùng trống sẽ bị cắt đứt tại dấu ngoặc. */
const FN = String.raw`(?:\s*\(\s*\d*\s*\))?`;

/** Hai lối viết chính tả cùng tồn tại trong văn bản hành chính: "Ủy" và "Uỷ". */
const UBND = String.raw`(?:(?:Ủy|Uỷ)\s*ban\s*nhân\s*dân|UBND)`;

/** Con dấu biểu mẫu ở góc phải, hay nằm chung đoạn với khối tiêu đề. */
const FORM_STAMP = /^\s*(?:Mẫu\s+\S+\s*)?(?:BH\s*theo\s*TT[^\n]*?TT-BCA\s*)?/u;

export const SLOTS = [
  // Token công dân — khai báo ở tokens.js, xếp trước để ưu tiên nhận diện.
  ...TOKEN_SLOTS,

  // ─── Khối tiêu đề (góc trên trái) ────────────────────────────────────────
  {
    id: 'coQuanThahs',
    pack: 'cong-an',
    label: 'Cơ quan THAHS ở khối tiêu đề',
    anchor: new RegExp(String.raw`CƠ QUAN THI HÀNH ÁN HÌNH SỰ\s+CÔNG AN${FN}`, 'u'),
    field: 'capTren',
    atLineStart: true,
    ignorePrefix: FORM_STAMP,
    // Chỉ nhận dạng viết hoa toàn bộ ở khối tiêu đề; dạng "Cơ quan thi hành án
    // hình sự Công an ..." trong câu là việc của slot kinhGuiThahs.
    caseSensitive: true,
    priority: 5,
  },
  {
    id: 'donViHeader',
    pack: 'cong-an',
    label: 'Khối tiêu đề: dòng 1 = cấp trên, dòng 2 = đơn vị',
    anchor: new RegExp(String.raw`CÔNG AN${FN}`, 'u'),
    // Khối tiêu đề công văn có hai dòng xếp chồng:
    //     CÔNG AN THÀNH PHỐ ĐỒNG NAI     ← cơ quan cấp trên
    //     CÔNG AN PHƯỜNG HÀNG GÒN        ← đơn vị ban hành
    // Mẫu nào chỉ có một dòng thì đó là cấp trên.
    fieldByOrdinal: ['capTren', 'donVi'],
    atLineStart: true,
    ignorePrefix: FORM_STAMP,
    // Chỉ nhận dạng VIẾT HOA TOÀN BỘ. Khối tiêu đề công văn luôn viết hoa;
    // dạng "Công an ......" trong thân bài là việc của slot congAnChung.
    // Nếu không phân biệt, các mẫu Đơn của công dân (không có khối tiêu đề)
    // sẽ bị tính nhầm dòng thân bài thành dòng tiêu đề thứ nhất.
    caseSensitive: true,
    priority: 1,
  },

  // ─── Số và ký hiệu văn bản ───────────────────────────────────────────────
  {
    id: 'kyHieuDonVi',
    pack: 'cong-an',
    label: 'Ký hiệu đơn vị trong số văn bản',
    // Khớp phần "/BC-", "/QĐ-", "/KH-" rồi điền ký hiệu đơn vị vào sau.
    anchor: /\/\s*\p{Lu}{1,10}\s*-/u,
    field: 'kyHieuDonVi',
    requires: /Số\s*:/u,
    caseSensitive: true,
    priority: 3,
  },
  {
    id: 'soVanBan',
    pack: 'cong-an',
    label: 'Số văn bản (thường để trống tới khi ban hành)',
    anchor: /Số\s*:/u,
    field: 'soVanBan',
    default: false,
    priority: 3,
  },

  // ─── Địa danh và ngày tháng ──────────────────────────────────────────────
  {
    id: 'diaDanh',
    pack: 'cong-an',
    label: 'Địa danh trước ngày tháng',
    anchor: /,?\s*ngày/u,
    position: 'before',
    field: 'diaDanh',
    atLineStart: true,
    requires: /tháng/u,
    priority: 4,
  },
  { id: 'ngay', pack: 'cong-an', label: 'Ngày', anchor: /ngày/u, field: 'ngay', requires: /tháng/u, default: false },
  { id: 'thang', pack: 'cong-an', label: 'Tháng', anchor: /tháng/u, field: 'thang', requires: /năm/u, default: false },
  { id: 'nam', pack: 'cong-an', label: 'Năm', anchor: /năm(?:\s*20)?/u, field: 'nam', default: false },

  // ─── Nơi gửi / nơi nhận ──────────────────────────────────────────────────
  {
    id: 'kinhGuiThahs',
    pack: 'cong-an',
    label: 'Kính gửi — cơ quan THAHS',
    anchor: new RegExp(String.raw`Cơ quan\s+(?:thi hành án hình sự|THAHS)\s+Công an${FN}`, 'u'),
    field: 'capTren',
    priority: 4,
  },
  {
    id: 'kinhGuiCongAn',
    pack: 'cong-an',
    label: 'Kính gửi — Công an',
    anchor: new RegExp(String.raw`Kính gửi\s*:\s*(?:-\s*)?Công an${FN}`, 'u'),
    field: 'capTren',
    priority: 4,
  },
  {
    id: 'chuTichUbnd',
    pack: 'cong-an',
    label: 'Chủ tịch Ủy ban nhân dân',
    anchor: new RegExp(String.raw`Chủ tịch\s+${UBND}${FN}`, 'u'),
    field: 'ubnd',
    priority: 4,
  },
  {
    id: 'ubnd',
    pack: 'cong-an',
    label: 'Ủy ban nhân dân',
    anchor: new RegExp(UBND + FN, 'u'),
    field: 'ubnd',
    priority: 2,
  },
  {
    id: 'toaAn',
    pack: 'cong-an',
    label: 'Tòa án nhân dân',
    // "Tòa" và "Toà" là hai lối bỏ dấu cùng tồn tại, phải nhận cả hai.
    anchor: new RegExp(String.raw`T(?:òa|oà)\s*án\s*nhân\s*dân${FN}`, 'u'),
    field: 'toaAn',
    priority: 2,
  },
  {
    id: 'kinhGuiChung',
    pack: 'cong-an',
    label: 'Kính gửi (bắt chung — nơi nhận thay đổi theo từng mẫu)',
    anchor: new RegExp(String.raw`Kính gửi\s*:${FN}`, 'u'),
    field: 'kinhGui',
    default: false,
    priority: 1,
  },
  {
    id: 'vienKiemSat',
    pack: 'cong-an',
    label: 'Viện kiểm sát nhân dân',
    anchor: new RegExp(String.raw`Viện kiểm sát nhân dân${FN}`, 'u'),
    field: 'vienKiemSat',
    priority: 2,
  },
  {
    id: 'noiNhanCongAn',
    pack: 'cong-an',
    label: 'Nơi nhận — Công an',
    anchor: new RegExp(String.raw`-\s*Công an${FN}`, 'u'),
    field: 'capTren',
    priority: 3,
  },

  // ─── Ý kiến / xác nhận / chữ ký ──────────────────────────────────────────
  {
    id: 'yKienCongAn',
    pack: 'cong-an',
    label: 'Ý kiến / xác nhận / xử lý của Công an',
    anchor: new RegExp(
      String.raw`(?:Ý\s*kiến|Xác\s*nhận|Xử\s*lý|Đề\s*nghị)\s+của\s+Công\s+an${FN}`,
      'u',
    ),
    field: 'donVi',
    priority: 4,
  },
  {
    id: 'chucDanhKy',
    pack: 'cong-an',
    label: 'Chức danh người ký — chỉ để "TRƯỞNG CÔNG AN"',
    anchor: new RegExp(String.raw`TRƯỞNG\s+CÔNG\s+AN${FN}`, 'u'),
    // Chỗ ký không ghi kèm tên đơn vị, nên chỉ xóa vùng chấm đi.
    clear: true,
    priority: 4,
  },

  // ─── Bắt chung, độ ưu tiên thấp nhất ─────────────────────────────────────
  // Chạy sau tất cả slot trên; chỉ nhận những chỗ chưa slot nào lấy.
  // Vẫn nằm trong phạm vi "đơn vị", không bao giờ chạm tới thông tin công dân.
  {
    id: 'congAnChung',
    pack: 'cong-an',
    label: 'Công an (bắt chung trong thân bài)',
    anchor: new RegExp(String.raw`Công an${FN}`, 'u'),
    field: 'donVi',
    priority: 0,
  },
];

/** Các slot bật sẵn (mọi slot trừ những slot khai báo default: false). */
export function enabledSlots(overrides = {}) {
  return SLOTS.filter((s) => overrides[s.id] ?? s.default ?? true);
}

export function slotById(id) {
  return SLOTS.find((s) => s.id === id);
}
