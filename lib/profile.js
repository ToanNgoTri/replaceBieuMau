/**
 * HỒ SƠ ĐƠN VỊ — khai một lần, dùng cho mọi biểu mẫu.
 *
 * Danh sách FIELDS được UI đọc để tự sinh form nhập liệu, nên thêm một trường
 * mới ở đây là form tự có thêm ô, không phải sửa giao diện.
 *
 * Lưu ý: ở đây KHÔNG có bất kỳ trường nào chứa thông tin công dân. App chỉ điền
 * phần đơn vị và ngữ cảnh.
 */

export const FIELDS = [
  {
    key: 'donVi',
    label: 'Tên đơn vị',
    hint: 'Ghép sau chữ "CÔNG AN" và "TRƯỞNG CÔNG AN"',
    example: 'phường Hàng Gòn',
    required: true,
  },
  {
    key: 'capTren',
    label: 'Cơ quan cấp trên / THAHS',
    hint: 'Ghép sau "Cơ quan thi hành án hình sự Công an"',
    example: 'tỉnh Đồng Nai',
    required: true,
  },
  {
    key: 'diaDanh',
    label: 'Địa danh',
    hint: 'Đứng trước "ngày ... tháng ... năm ..."',
    example: 'Hàng Gòn',
    required: true,
  },
  {
    key: 'kyHieuDonVi',
    label: 'Ký hiệu đơn vị',
    hint: 'Phần sau dấu gạch trong số văn bản, ví dụ Số: ..../BC-CAP',
    example: 'CAP',
    required: true,
  },
  {
    key: 'ubnd',
    label: 'Ủy ban nhân dân',
    example: 'phường Hàng Gòn',
    required: false,
  },
  {
    key: 'toaAn',
    label: 'Tòa án nhân dân',
    hint: 'Dùng ở các mẫu gửi Tòa án',
    example: 'khu vực 4, tỉnh Đồng Nai',
    required: false,
  },
  {
    key: 'vienKiemSat',
    label: 'Viện kiểm sát nhân dân',
    example: 'khu vực 4, tỉnh Đồng Nai',
    required: false,
  },
  { key: 'soVanBan', label: 'Số văn bản', example: '', required: false },
  { key: 'ngay', label: 'Ngày', example: '', required: false },
  { key: 'thang', label: 'Tháng', example: '', required: false },
  { key: 'nam', label: 'Năm', example: '', required: false },
];

/** Hồ sơ mẫu — dùng cho kiểm thử và làm giá trị khởi tạo. */
export const SAMPLE_PROFILE = {
  donVi: 'phường Hàng Gòn',
  capTren: 'thành phố Đồng Nai',
  diaDanh: 'Hàng Gòn',
  kyHieuDonVi: 'CAP',
  ubnd: 'phường Hàng Gòn',
  toaAn: 'khu vực 4, tỉnh Đồng Nai',
  vienKiemSat: 'khu vực 4, tỉnh Đồng Nai',
};

export function validate(profile) {
  return FIELDS.filter((f) => f.required && !String(profile[f.key] ?? '').trim()).map(
    (f) => f.label,
  );
}
