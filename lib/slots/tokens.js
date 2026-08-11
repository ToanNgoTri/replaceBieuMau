/**
 * TOKEN CÔNG DÂN — chỗ giữ chỗ theo cú pháp docxtemplater `{TÊN}`.
 *
 * Từ vựng token lấy đúng theo dự án ppv2web (`app/api/generatedocs/route.js`),
 * nên file .docx do đây xuất ra dùng được ngay làm template cho ppv2web:
 *
 *     bieu-mau  →  điền đơn vị + chèn {TOKEN}  →  ppv2web điền dữ liệu công dân
 *
 * Chỉ khai báo token nào ppv2web thực sự có trong `dataDict`. Các trường thuộc
 * hồ sơ vụ việc (Tội danh, Hình phạt chính, Thời hạn chấp hành...) KHÔNG có
 * trong ppv2web nên để nguyên dấu chấm, điền tay.
 *
 * Mọi token đều được BÔI VÀNG để soát cho nhanh trong Word.
 */
import { FILLER, FILLER_DATE } from './matcher.js';

const HL = 'yellow';

/**
 * Có ô để trống bằng KÝ TỰ TAB chứ không phải dấu chấm, ví dụ:
 *
 *     Con ông: ……………(9) và bà: ⇥(10)
 *
 * Không thể coi mọi khoảng trắng là ô trống — sẽ khớp bừa khắp nơi. Nhưng nếu
 * ngay sau khoảng trắng là dấu chú thích "(9)" thì gần như chắc chắn đó là ô
 * cần điền, nên chấp nhận thêm dạng này.
 */
const FILLER_OR_TAB = `(?:${FILLER}|[\\s\\u00a0]+(?=\\())`;

/** Rút gọn khai báo: nhãn cố định + token tương ứng. */
function tok(id, anchor, token, extra = {}) {
  return {
    id,
    pack: 'cong-dan',
    label: `Token ${token}`,
    anchor,
    token,
    highlight: HL,
    priority: 6, // cao hơn mọi slot đơn vị, tránh bị slot bắt-chung cướp mất
    ...extra,
  };
}

export const TOKEN_SLOTS = [
  // ─── Nhân thân ───────────────────────────────────────────────────────────
  // "Tên gọi khác" là cách viết của bộ THNCĐ, "Họ tên khác" của bộ THAHSTCD.
  tok('tkHoTenKhac', /(?:Họ\s*(?:và\s*)?tên|Tên\s*gọi)\s*khác\s*:/u, 'TENKHAC', { priority: 7 }),
  tok('tkTenCha', /(?:Họ\s*(?:và\s*)?tên\s*)?cha\s*:|Con\s*ông\s*:/u, 'TENCHA', {
    priority: 7,
    filler: FILLER_OR_TAB,
  }),
  tok('tkTenMe', /(?:Họ\s*(?:và\s*)?tên\s*)?mẹ\s*:|(?:và\s*)?bà\s*:/u, 'TENME', {
    priority: 7,
    filler: FILLER_OR_TAB,
  }),
  tok('tkHoTen', /Họ\s*(?:và\s*)?tên\s*:|Tên\s*tôi\s*là\s*:/u, 'HOTEN'),
  tok('tkGioiTinh', /Giới\s*tính\s*:/u, 'GIOITINH'),
  tok('tkDanToc', /Dân\s*tộc\s*:/u, 'DANTOC'),
  tok('tkTonGiao', /Tôn\s*giáo\s*:/u, 'TONGIAO'),
  // "Học vấn" là cách viết của bộ THNCĐ.
  tok('tkTrinhDo', /(?:Trình\s*độ\s*(?:học\s*vấn)?|Học\s*vấn)\s*:/u, 'TRINHDO'),
  tok('tkNgheNghiep', /Nghề\s*nghiệp\s*:/u, 'NGHENGHIEP'),
  tok('tkNoiLamViec', /Nơi\s*làm\s*việc\s*:/u, 'NOILAMVIEC'),
  tok('tkSdt', /(?:Số\s*điện\s*thoại|Điện\s*thoại|SĐT)[^:]{0,24}:/u, 'SDT'),

  // ─── Ngày sinh: gộp ba token theo đúng cách ppv2web tách ─────────────────
  {
    id: 'tkNgaySinh',
    pack: 'cong-dan',
    label: 'Token NGAYSINH / THANGSINH / NAMSINH',
    anchor: /Ngày\s*sinh\s*:/u,
    filler: FILLER_DATE,
    replacement: '{NGAYSINH}/{THANGSINH}/{NAMSINH}',
    highlight: HL,
    priority: 7,
  },

  // ─── Giấy tờ tùy thân ────────────────────────────────────────────────────
  tok('tkCccd', /(?:Số\s*)?(?:CC\/CCCD\/Hộ\s*chiếu|CCCD|Căn\s*cước[^:]{0,20})\s*:/u, 'CCCD', {
    priority: 7,
  }),
  {
    id: 'tkNgayCap',
    pack: 'cong-dan',
    label: 'Token NGAYCAP / THANGCAP / NAMCAP',
    anchor: /Ngày\s*cấp\s*:/u,
    filler: FILLER_DATE,
    replacement: '{NGAYCAP}/{THANGCAP}/{NAMCAP}',
    highlight: HL,
    priority: 7,
  },
  // Dấu hai chấm để tùy chọn: bộ THNCĐ viết "Nơi cấp…………" không có dấu.
  // Không sợ đụng "Nơi cấp giấy:" vì sau "Nơi cấp" là chữ "giấy", không phải vùng chấm.
  tok('tkNoiCap', /Nơi\s*cấp\s*:?/u, 'NOICAP'),

  // ─── Nơi chốn ────────────────────────────────────────────────────────────
  tok('tkNoiSinh', /Nơi\s*sinh\s*:/u, 'NOISINH'),
  tok('tkQueQuan', /(?:Quê\s*quán|Nguyên\s*quán)\s*:/u, 'QUEQUAN'),
  tok('tkNoiThTru', /Nơi\s*(?:ĐKTT|đăng\s*ký\s*thường\s*trú|thường\s*trú)\s*:/u, 'NOITHTRU'),
  tok('tkNoiOHienTai', /Nơi\s*(?:ở|cư\s*trú)\s*hiện\s*(?:nay|tại)\s*:/u, 'NOIOHIENTAI'),

  // ─── Hồ sơ vụ việc (nhóm THACĐ trong ppv2web) ────────────────────────────
  // Chỉ có ý nghĩa với người đang chấp hành án; ppv2web bật nhóm này bằng ô
  // tích THACĐ. Nếu không tích, các key vẫn được gửi kèm giá trị rỗng nên
  // token render ra chuỗi trống chứ không lỗi.
  tok('tkToiDanh', /Tội\s*danh\s*:/u, 'TOIDANH'),
  tok('tkHinhPhatChinh', /Hình\s*phạt\s*chính\s*:/u, 'HINHPHATCHINH', { priority: 7 }),
  tok('tkThoiHanChapHanh', /Thời\s*hạn\s*chấp\s*hành[^:]{0,30}:/u, 'THOIHANCHAPHANH', {
    priority: 7,
  }),
  tok('tkThoiHan', /Thời\s*hạn\s*:/u, 'THOIHAN'),
  tok('tkNoiDungChapHanh', /Nội\s*dung\s*chấp\s*hành\s*(?:\(\s*\d*\s*\))?\s*:/u, 'NOIDUNGCHAPHANH'),
  {
    id: 'tkNgayChapHanh',
    pack: 'cong-dan',
    label: 'Token NGAYCHAPHANH / THANGCHAPHANH / NAMCHAPHANH',
    anchor: /Ngày\s*chấp\s*hành\s*:/u,
    filler: FILLER_DATE,
    replacement: '{NGAYCHAPHANH}/{THANGCHAPHANH}/{NAMCHAPHANH}',
    highlight: HL,
    priority: 7,
  },

  // Cụm "Bản án số ..... ngày ../../.... của TAND ..... và Quyết định thi hành
  // án số ..... ngày ../../.... của TAND ....." — bốn ô rời trong một câu.
  // Neo của các slot này trùm lên nhau, nhưng vùng điền tách biệt nên tất cả
  // cùng hoạt động.
  tok('tkSoBanAn', /Bản\s*án\s*số\s*:?/u, 'SOBANAN', { priority: 8 }),
  {
    id: 'tkNgayBanAn',
    pack: 'cong-dan',
    label: 'Token ngày Bản án',
    anchor: /Bản\s*án\s*số\s*:?[.…\s:,]*ngày/u,
    filler: FILLER_DATE,
    replacement: '{NGAYBANAN}/{THANGBANAN}/{NAMBANAN}',
    highlight: HL,
    priority: 8,
  },
  tok('tkSoQdTha', /Quyết\s*định\s*(?:thi\s*hành\s*án\s*)?số\s*:?/u, 'SOQDTHA', { priority: 8 }),
  {
    id: 'tkNgayQdTha',
    pack: 'cong-dan',
    label: 'Token ngày Quyết định THA',
    anchor: /Quyết\s*định\s*(?:thi\s*hành\s*án\s*)?số\s*:?[.…\s:,]*ngày/u,
    filler: FILLER_DATE,
    replacement: '{NGAYQDTHA}/{THANGQDTHA}/{NAMQDTHA}',
    highlight: HL,
    priority: 8,
  },
  // ─── Hồ sơ tái hòa nhập cộng đồng (nhóm THNCĐ trong ppv2web) ─────────────
  // Dành cho người ĐÃ chấp hành xong án phạt tù — từ vựng khác hẳn nhóm THACĐ.
  // Phạm vi giới hạn ở mục 16 và 17 của Phiếu thông tin (M165). Các mục khác
  // (ngày xóa án tích, quyết định phân công giúp đỡ, thông tin gia đình…) giữ
  // nguyên dấu chấm để điền tay.
  tok('tkNghiaVuDanSu', /Hình\s*phạt\s*bổ\s*sung[^:]{0,80}:/u, 'NGHIAVUDANSU', { priority: 7 }),
  // "Nơi cấp giấy" phải thắng "Nơi cấp" nên cần ưu tiên cao hơn.
  tok('tkNoiCapGiay', /Nơi\s*cấp\s*giấy\s*:/u, 'NOICAPGIAY', { priority: 8 }),

  {
    id: 'tkNgayChxapt',
    pack: 'cong-dan',
    label: 'Token ngày chấp hành xong án phạt tù / đặc xá',
    anchor: /(?:Ngày\s*)?[Cc]hấp\s*hành\s*xong\s*án\s*phạt\s*tù[^:.…]{0,30}(?:ngày|:)/u,
    filler: FILLER_DATE,
    replacement: '{NGAYCHXAPT}/{THANGCHXAPT}/{NAMCHXAPT}',
    highlight: HL,
    priority: 8,
  },
  tok('tkSoChungNhan', /Chứng\s*nhận\s*(?:CHXAPT|chấp\s*hành\s*xong\s*án\s*phạt\s*tù)[^:]{0,20}số\s*:?/u,
    'SOCHUNGNHAN', { priority: 8 }),
  {
    id: 'tkNgayChungNhan',
    pack: 'cong-dan',
    label: 'Token ngày Chứng nhận CHXAPT',
    anchor: /Chứng\s*nhận[^:]{0,60}số\s*:?[.…\s:,]*ngày/u,
    filler: FILLER_DATE,
    replacement: '{NGAYCHUNGNHAN}/{THANGCHUNGNHAN}/{NAMCHUNGNHAN}',
    highlight: HL,
    priority: 8,
  },
  {
    id: 'tkTand',
    pack: 'cong-dan',
    label: 'Token TAND — lần 1 là tòa ra bản án, lần 2 là tòa ra quyết định',
    anchor: /(?:của\s*)?T(?:òa|oà)?\s*án\s*nhân\s*dân|của\s*TAND/u,
    // Đếm lại từ đầu ở mỗi đoạn: hai chữ "của TAND" trong cùng một câu là hai
    // tòa khác nhau, nhưng câu sau lại bắt đầu một cặp mới.
    ordinalScope: 'paragraph',
    tokenByOrdinal: ['TANDBANAN', 'TANDQDTHA'],
    highlight: HL,
    priority: 6,
  },
];
