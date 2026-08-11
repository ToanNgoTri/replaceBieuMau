# Điền biểu mẫu hành chính

Xử lý hàng loạt biểu mẫu `.docx`, giữ nguyên tuyệt đối định dạng gốc:

1. **Điền ô đơn vị / ngữ cảnh** từ hồ sơ đơn vị — tên cơ quan, địa danh, ký hiệu
   văn bản, chức danh người ký.
2. **Chèn token công dân** `{HOTEN}`, `{CCCD}`… theo cú pháp docxtemplater, và
   **bôi vàng** để soát cho nhanh.

Kết quả là file `.docx` dùng được ngay làm template cho dự án **ppv2web**:

```
bieu-mau                              ppv2web
mẫu trống  →  điền đơn vị             template  →  điền dữ liệu công dân
              + chèn {TOKEN}                        từ Supabase
```

Engine **chỉ thay thế vùng dấu chấm**, không bao giờ ghi đè nội dung đã có. Và
chỉ những ô khớp với khai báo trong `lib/slots/` mới được đụng tới — đây là bảo
đảm bằng thiết kế, không phải bằng kiểm tra lúc chạy.

## Chạy thử

```bash
npm install

# Quét độ phủ trên một thư mục mẫu
npm run scan -- "/đường/dẫn/thư-mục-mẫu"
npm run scan -- "/đường/dẫn/thư-mục-mẫu" --misses   # xem đoạn còn sót

# Điền một file, in ra từng thay đổi
npm run fill -- "mau.docx" ./ket-qua

# Điền cả thư mục theo hồ sơ riêng
npm run fill -- "/thư-mục-mẫu" ./ket-qua ./ho-so-don-vi.json

# Soi một slot đang bắt vào những chỗ nào
node scripts/inspect.mjs "/thư-mục-mẫu" chucDanhKy
```

`ho-so-don-vi.json` — xem `SAMPLE_PROFILE` trong `lib/profile.js`:

```json
{
  "donVi": "phường Hàng Gòn",
  "capTren": "thành phố Đồng Nai",
  "diaDanh": "Hàng Gòn",
  "kyHieuDonVi": "CAP",
  "ubnd": "phường Hàng Gòn"
}
```

Kết quả trên khối tiêu đề và chỗ ký:

```
CÔNG AN THÀNH PHỐ ĐỒNG NAI        ← capTren  (dòng 1)
CÔNG AN PHƯỜNG HÀNG GÒN           ← donVi    (dòng 2)
Số: ................/BC-CAP       ← kyHieuDonVi
Hàng Gòn, ngày ..... tháng .....  ← diaDanh
                                     TRƯỞNG CÔNG AN     ← xóa trống, không kèm đơn vị
```

## Kiến trúc

```
lib/docx/zip.js     giải nén / đóng gói .docx (ZIP + XML)
lib/docx/text.js    ánh xạ text phẳng ↔ các node <w:t> rời rạc
lib/docx/fill.js    điều phối: duyệt đoạn → dò ô → ghi
lib/slots/matcher.js  nhận diện ô trống, xử lý chồng lấn và chữ hoa/thường
lib/slots/definitions.js  ★ khai báo ô đơn vị — tri thức nghiệp vụ ở đây
lib/slots/tokens.js   ★ khai báo token công dân theo từ vựng ppv2web
lib/profile.js      định nghĩa trường hồ sơ đơn vị (UI đọc để tự sinh form)
```

### Ba vấn đề kỹ thuật cốt lõi

**1. Word cắt một câu thành nhiều `<w:r>` tùy tiện.** Chuỗi `TRƯỞNG CÔNG AN ……`
có thể nằm rải trong 4 node khác nhau, nên tìm-thay trên từng node sẽ trượt.
`text.js` ghép cả đoạn thành một chuỗi phẳng để so khớp, giữ bảng offset để ghi
ngược lại đúng node. Ta **không gộp run** — gộp run là thao tác phá hủy, làm mất
ranh giới định dạng.

**2. Cùng một ô nhưng có ~10 kiểu dấu chấm.** `…..`, `.............`, `….……`,
`……..(1)`, `……` không dấu cách. `matcher.js` nhận diện theo **neo + vùng chấm**
thay vì so chuỗi cố định. Vùng chấm phải có ít nhất 2 ký tự chấm để không nuốt
nhầm dấu chấm cuối câu.

**3. Dấu chấm được gõ nhỏ hơn nhãn.** Người soạn mẫu thu nhỏ dãy chấm để nhét
vừa dòng — cùng một biểu mẫu có chỗ nhãn 13pt mà chấm chỉ 10pt, có chỗ 9pt:

```
1. Họ tên:  →  '1. '(13pt) 'Họ tên'(13pt) ':'(10pt) '..........'(10pt)
2. Tên gọi khác:  →  '2. Tên gọi khác:'(13pt) '............'(9pt)
```

Ghi đè tại chỗ thì chữ điền vào thừa hưởng cỡ của dấu chấm, ra kết quả chỗ to
chỗ bé. Engine lấy định dạng ở **đầu nhãn** (`styleAt`), không phải ở vùng chấm
liền kề — kể cả khi ký tự sát trước ô cũng bị thu nhỏ (dấu `:` ở ví dụ trên).

## Cỡ chữ của phần được điền

Theo chuẩn trình bày văn bản hành chính, phần điền vào được ép cỡ chữ:

| Kiểu chữ | Cỡ | Ví dụ |
|---|---|---|
| IN HOA | **13pt** | `CÔNG AN THÀNH PHỐ ĐỒNG NAI`, `PHƯỜNG HÀNG GÒN`, `CAP` |
| chữ thường | **14pt** | `Hàng Gòn`, `phường Hàng Gòn`, `thành phố Đồng Nai` |
| token | **14pt** | `{HOTEN}`, `{NGAYSINH}/{THANGSINH}/{NAMSINH}` |

Token luôn tính là 14pt: tuy `{HOTEN}` viết hoa nhưng giá trị thật sẽ là
"Ngô Quang Tâm", tức chữ thường. Đổi ngưỡng ở `CO_CHU_IN_HOA` / `CO_CHU_THUONG`
trong `lib/docx/fill.js`.

Font chữ, nghiêng, màu vẫn lấy theo nhãn. Thẻ `<w:sz>` và `<w:szCs>` được chèn
đúng vị trí lược đồ OOXML quy định (`upsertRunProp` tra bảng `RPR_ORDER`).

## In đậm khối tiêu đề

Theo chuẩn công văn, cơ quan cấp trên **không** in đậm còn đơn vị ban hành **có**:

```
CÔNG AN THÀNH PHỐ ĐỒNG NAI      ← thường
CÔNG AN PHƯỜNG HÀNG GÒN         ← đậm
```

Mẫu gốc làm không thống nhất (8 chỗ cấp trên bị đậm, 10 chỗ đơn vị bị thường),
nên slot `donViHeader` khai `boldByOrdinal: [false, true]` để ép lại cho đều.

Hai điểm cần lưu ý khi cài:

- **Ép cho cả nhãn lẫn phần điền.** `CÔNG AN` nằm sẵn trong mẫu, ` PHƯỜNG HÀNG
  GÒN` là phần ta chèn — chỉ đậm một nửa thì dòng lệch nhau. Engine áp cho mọi
  run trong khoảng `boldRange`, tức cả cụm khớp.
- **Bỏ đậm phải ghi rõ `w:val="0"`**, không được xóa thẻ `<w:b>` đi, vì khi đó
  run sẽ thừa kế lại in đậm từ style của đoạn.

Không ép in đậm cho cả đoạn, vì ở nhiều mẫu con dấu `Mẫu M124 · BH theo TT số
129/2026/TT-BCA` nằm chung đoạn với dòng tiêu đề — đậm cả đoạn sẽ đậm luôn con
dấu.

### Bằng chứng định dạng không đổi

Diff XML trước/sau khi điền chỉ hiện các node `<w:t>`. Không một dòng `<w:rPr>`,
`<w:pPr>`, `<w:tabs>`, `<w:spacing>` nào thay đổi:

```
< <w:t>CÔNG AN …………………</w:t>
> <w:t>CÔNG AN PHƯỜNG HÀNG GÒN</w:t>
< <w:t>……..</w:t>
> <w:t>CAP</w:t>
```

## Token công dân

Từ vựng lấy đúng theo `ppv2web/app/api/generatedocs/route.js`, nên file xuất ra
render được ngay bằng `docxtemplater`:

| Nhãn trong biểu mẫu | Token chèn vào |
|---|---|
| `Họ tên:` | `{HOTEN}` |
| `Họ tên khác:` | `{TENKHAC}` |
| `Giới tính:` | `{GIOITINH}` |
| `Ngày sinh:` | `{NGAYSINH}/{THANGSINH}/{NAMSINH}` |
| `Số CC/CCCD/Hộ chiếu:` | `{CCCD}` |
| `Ngày cấp:` | `{NGAYCAP}/{THANGCAP}/{NAMCAP}` |
| `Nơi cấp:` | `{NOICAP}` |
| `Nơi ĐKTT:` | `{NOITHTRU}` |
| `Nơi ở hiện nay:` | `{NOIOHIENTAI}` |
| `Nghề nghiệp:` · `Nơi làm việc:` | `{NGHENGHIEP}` · `{NOILAMVIEC}` |
| `Dân tộc:` · `Tôn giáo:` · `Quê quán:` · `Nơi sinh:` | `{DANTOC}` · `{TONGIAO}` · `{QUEQUAN}` · `{NOISINH}` |
| `Trình độ học vấn:` · `Số điện thoại:` | `{TRINHDO}` · `{SDT}` |
| `Cha:` · `Mẹ:` | `{TENCHA}` · `{TENME}` |

Mọi token đều được bôi vàng. Việc bôi vàng **tách run** thay vì tô cả `<w:r>` —
vì nhãn và vùng chấm thường nằm chung một run, tô cả run sẽ tô lây sang nhãn:

```xml
<w:r><w:rPr><w:sz w:val="26"/><w:highlight w:val="yellow"/></w:rPr>
     <w:t xml:space="preserve"> {HOTEN}</w:t></w:r>
```

`<w:highlight>` được chèn đúng vị trí lược đồ OOXML quy định (sau `<w:szCs>`,
trước `<w:lang>`), nên Word không báo tài liệu hỏng.

### Nhóm THACĐ — hồ sơ vụ việc

Bật bằng ô tích **THACĐ** trong ppv2web. Cả 18 key luôn được gửi kèm (rỗng nếu
không tích), nên token không bao giờ render ra chữ `undefined`.

| Nhãn trong biểu mẫu | Token |
|---|---|
| `Tội danh:` | `{TOIDANH}` |
| `Hình phạt chính:` · `Thời hạn:` | `{HINHPHATCHINH}` · `{THOIHAN}` |
| `Thời hạn chấp hành:` | `{THOIHANCHAPHANH}` |
| `Ngày chấp hành:` | `{NGAYCHAPHANH}/{THANGCHAPHANH}/{NAMCHAPHANH}` |
| `Bản án số ... ngày ... của TAND ...` | `{SOBANAN}` · `{NGAYBANAN}/{THANGBANAN}/{NAMBANAN}` · `{TANDBANAN}` |
| `Quyết định thi hành án số ... ngày ... của TAND ...` | `{SOQDTHA}` · `{NGAYQDTHA}/{THANGQDTHA}/{NAMQDTHA}` · `{TANDQDTHA}` |
| `Nội dung chấp hành:` | `{NOIDUNGCHAPHANH}` |

Câu bản án chứa **bốn ô riêng biệt và hai chữ `của TAND` khác nghĩa nhau** — lần
đầu là tòa ra bản án, lần sau là tòa ra quyết định thi hành án. Engine xử lý bằng
`ordinalScope: 'paragraph'`: đếm lại từ đầu ở mỗi đoạn, nên câu sau lại bắt đầu
một cặp mới.

```
Theo bản án số {SOBANAN} ngày {NGAYBANAN}/{THANGBANAN}/{NAMBANAN} của TAND {TANDBANAN}
và Quyết định thi hành án số {SOQDTHA} ngày {NGAYQDTHA}/{THANGQDTHA}/{NAMQDTHA} của TAND {TANDQDTHA}
```

### Nhóm THNCĐ — tái hòa nhập cộng đồng

Bật bằng ô tích **THNCĐ** trong ppv2web. Dành cho người **đã** chấp hành xong án
phạt tù, nên từ vựng khác hẳn nhóm THACĐ.

Phạm vi giới hạn ở **mục 16 và 17** của Phiếu thông tin M165. Các mục còn lại
(ngày xóa án tích, quyết định phân công giúp đỡ, thông tin gia đình…) **giữ
nguyên dấu chấm** để điền tay.

| Nhãn trong biểu mẫu | Token |
|---|---|
| `Chấp hành xong án phạt tù/được đặc xá ngày ../../..` | `{NGAYCHXAPT}/{THANGCHXAPT}/{NAMCHXAPT}` |
| `Chứng nhận CHXAPT/đặc xá số ..., ngày ../../..` | `{SOCHUNGNHAN}` · `{NGAYCHUNGNHAN}/{THANGCHUNGNHAN}/{NAMCHUNGNHAN}` |
| `Nơi cấp giấy:` | `{NOICAPGIAY}` |
| `Hình phạt bổ sung, bồi thường dân sự, án phí…:` | `{NGHIAVUDANSU}` |

Bộ THNCĐ còn viết một số nhãn khác đi so với THAHSTCD, đã gộp vào cùng token:
`Tên gọi khác` → `{TENKHAC}`, `Học vấn` → `{TRINHDO}`,
`Con ông … và bà …` → `{TENCHA}` · `{TENME}`.

Riêng dòng `Con ông … và bà …` có ô để trống bằng **ký tự tab** thay vì dấu chấm
(`và bà: ⇥(10)`). Không thể coi mọi khoảng trắng là ô trống, nhưng nếu ngay sau
đó là dấu chú thích `(10)` thì gần như chắc chắn là ô cần điền — engine dùng
`FILLER_OR_TAB` cho riêng hai slot này.

## Thêm biểu mẫu mới — chỉ sửa dữ liệu, không sửa code

Thêm một object vào `SLOTS` trong `lib/slots/definitions.js`:

```js
{
  id: 'chuTichUbnd',
  label: 'Chủ tịch Ủy ban nhân dân',
  anchor: /Chủ tịch\s+(?:Ủy|Uỷ) ban nhân dân/u,  // phần chữ cố định
  field: 'ubnd',        // trường trong hồ sơ đơn vị
  priority: 4,          // cao hơn = thắng khi chồng lấn
}
```

| Thuộc tính | Ý nghĩa |
|---|---|
| `anchor` | chuỗi hoặc RegExp — phần chữ cố định nhận diện ô |
| `position` | `'after'` (mặc định) hoặc `'before'` — vùng trống nằm sau/trước neo |
| `field` | tên trường trong hồ sơ đơn vị |
| `fieldByOrdinal` | mảng tên trường theo thứ tự xuất hiện; giá trị cuối lặp lại. Dùng cho khối tiêu đề hai dòng: `['capTren', 'donVi']` |
| `tokenByOrdinal` | như trên nhưng cho token: `['TANDBANAN', 'TANDQDTHA']` |
| `ordinalScope` | `'document'` (mặc định) hoặc `'paragraph'` — phạm vi đếm thứ tự |
| `clear` | `true` = xóa vùng chấm, không điền gì. Dùng cho chỗ ký chỉ để `TRƯỞNG CÔNG AN` |
| `token` | tên token docxtemplater, ví dụ `'HOTEN'` → chèn `{HOTEN}` |
| `replacement` | chuỗi cố định, dùng cho token ghép: `'{NGAYSINH}/{THANGSINH}/{NAMSINH}'` |
| `filler` | RegExp thay vùng chấm mặc định. Có sẵn `FILLER_DATE` cho ô `…/…/…` |
| `highlight` | màu nền, ví dụ `'yellow'` |

Hai slot **dùng chung đoạn neo vẫn cùng hoạt động**, miễn là chúng điền vào ô
khác nhau — engine xét chồng lấn theo *vùng điền*, không theo cả cụm khớp. Nhờ
vậy `Bản án số ..... ngày ..../..../....` tách được thành hai slot riêng.
| `atLineStart` | chỉ khớp khi neo nằm đầu đoạn (dùng cho khối tiêu đề) |
| `ignorePrefix` | RegExp — phần đầu đoạn bỏ qua khi xét `atLineStart` |
| `requires` | RegExp — đoạn phải chứa mẫu này thì mới xét |
| `priority` | số nguyên, quyết định ai thắng khi hai slot chồng lấn |
| `caseSensitive` | phân biệt hoa thường (mặc định: không) |
| `default: false` | tắt sẵn, người dùng tự bật |

Quy trình khuyến nghị khi gặp họ biểu mẫu mới:

1. `npm run scan -- "<thư mục mới>" --misses` — xem những đoạn còn ô trống mang
   tính ngữ cảnh mà chưa slot nào nhận
2. Thêm slot tương ứng vào `definitions.js`
3. Quét lại, lặp cho tới khi danh sách sót chỉ còn các ô thật sự phải điền tay

Engine tự xử lý: chữ hoa/thường theo neo (`CÔNG AN` → giá trị viết hoa,
`Công an` → giữ nguyên), khoảng trắng ngăn cách (`/BC-` + `CAP` viết liền,
`TRƯỞNG CÔNG AN` + `PHƯỜNG…` có dấu cách), và dấu chú thích `(1)` được giữ lại.

## Kết quả trên hai bộ mẫu (TT 129/2026/TT-BCA)

| Bộ mẫu | Số file | Ô xử lý |
|---|---|---|
| `4. Bieu mau, so THAHSTCD` — thi hành án hình sự tại cộng đồng | 95 | 1989 |
| `5. Bieu mau, so THNCĐ` — tái hòa nhập cộng đồng | 12 | 128 |

**107/107 file là template docxtemplater hợp lệ**, sinh ra **49 token**, render
thử bằng chính `docxtemplater` của ppv2web đều thành công. ZIP nguyên vẹn toàn
bộ, và mọi token đều có key tương ứng trong `dataDict` của ppv2web.

## Hạn chế đã biết

- **File `.doc` (Word 97) không xử lý được.** Đó là định dạng nhị phân OLE, không
  phải ZIP+XML. Cần convert sang `.docx` bằng LibreOffice trước.
- **Bìa các `Sổ theo dõi` (M152–M163) không điền được.** Bìa chỉ có hai dòng chấm
  trần, không có chữ neo nào để nhận diện. Điền tay một lần cho mỗi quyển sổ.
- **`Kính gửi:` không có tên cơ quan đi kèm** được để trống, vì nơi nhận thay đổi
  theo từng mẫu. Bật slot `kinhGuiChung` nếu muốn điền cứng một giá trị.
- Số văn bản và ngày tháng **để trống theo mặc định** (thường chỉ điền khi ban
  hành). Bật slot `soVanBan` / `ngay` / `thang` / `nam` nếu cần.
- **`Họ tên:` của cán bộ cũng bị token hóa thành `{HOTEN}`.** Ở các mẫu phân công
  cán bộ (`Phân công ông/bà: Họ tên: .....`), nhãn giống hệt nhãn của người chấp
  hành án nên không phân biệt được bằng chữ. Soát lại các mẫu Quyết định phân
  công sau khi chạy.
