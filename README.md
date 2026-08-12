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

lib/sheet/xlsx.js       đọc .xlsx → mảng hàng (chuỗi)
lib/sheet/ods.js        đọc .ods  → mảng hàng, kèm sửa lỗi ngày của LibreOffice
lib/population/cot.js      dò cột theo nhãn tiêu đề, không theo số thứ tự cột
lib/population/nhandang.js ★ nhận ra file nào là bảng gì, bằng nội dung
lib/population/fields.js   ★ chuẩn hoá từng trường dân cư — CCCD, ngày, địa chỉ
lib/population/quanhe.js   ★ suy quan hệ với chủ hộ từ cây gia đình trong hộ
lib/population/convert.js  ★ ghép các bảng kết xuất thành bản ghi `population`
lib/population/csv.js      xuất CSV đúng quy ước nhập liệu của Supabase
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

---

# Convert dữ liệu dân cư → Supabase

Luồng thứ hai của kho này, độc lập hoàn toàn với phần biểu mẫu: chuyển các bảng
kết xuất từ hệ thống dân cư thành CSV nhập thẳng vào bảng `population` mà
ppv2web đang dùng.

```
nhan khau.ods    24.292 nhân khẩu thường trú — bảng gốc, một dòng một người
dan toc.xlsx      2.013 người, cột cuối là tên dân tộc
ton giao.xlsx    13.451 người, cột cuối là tên tôn giáo
HO KHAU.xlsx      5.353 hộ — cho biết CCCD của chủ hộ  (không bắt buộc)
                        ↓ ghép theo CCCD, suy quan hệ theo từng hộ
                 population.csv → Table Editor → bảng population
```

```bash
npm run convert -- ~/Downloads ./ket-qua-dancu --kinh

# hoặc chỉ tên thẳng từng file, tên gì cũng được
npm run convert -- "nhan khau.ods" "dan toc.xlsx" "ton giao.xlsx" "HO KHAU.xlsx" ./ket-qua-dancu
```

Đưa vào cả thư mục hay từng file đều được, **đặt tên gì cũng được** — engine
nhận dạng bằng nội dung (xem mục dưới). Chỉ bảng nhân khẩu là bắt buộc; thiếu
file nào thì cột tương ứng để trống, riêng thiếu bảng hộ khẩu thì chủ hộ được dò
theo tên — vẫn ra 5.325/5.353 hộ.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--don-vi "Hàng Gòn"` | tên đơn vị cấp xã, dùng để cắt đuôi địa chỉ |
| `--kinh` | ai không có tên trong file dân tộc thì ghi `KINH` |
| `--chia 5000` | cắt CSV thành nhiều file, mỗi file bấy nhiêu dòng |
| `--khong-doi-ngay` | giữ nguyên ngày trong `.ods`, không sửa lỗi LibreOffice |

## Nhận dạng file bằng nội dung, không bằng tên

Tên file kết xuất đổi theo từng lần tải về, nên đoán theo tên là sai sớm hay
muộn. Engine đọc 400 hàng đầu của mỗi file rồi nhận dạng theo dấu hiệu bên trong:

| Bảng | Dấu hiệu nhận ra |
|---|---|
| nhân khẩu | có cột `Họ tên cha` + `Họ tên mẹ`, **không** có cột giá trị thêm |
| hộ khẩu | cột tên là `Họ tên chủ hộ`, có `Ngày lập`, **không** có cột cha/mẹ |
| dân tộc | như nhân khẩu, thêm cột không tiêu đề chứa **tên dân tộc** |
| tôn giáo | như nhân khẩu, thêm cột không tiêu đề chứa **tên tôn giáo** |

Hai file lọc có tiêu đề **giống hệt nhau**, chỉ khác nội dung cột cuối, nên phải
phân biệt bằng **từ vựng**. May là cả hai đều là tập đóng — 54 dân tộc và mười
mấy tôn giáo được công nhận — nên chỉ cần đếm số dòng khớp mỗi bên rồi so. Giá
trị có ở cả hai bên (`Khác`, `Chưa có thông tin`) bị loại khỏi phép đếm.

Chạy trên thư mục Tải về thật, trong đó có 10 bảng tính không liên quan:

```
Nhận dạng theo nội dung:
  hộ khẩu    DS 5412 dong.xlsx         cột tên là "Họ tên chủ hộ", không có cột cha/mẹ
  dân tộc    Export_20260812_A.xlsx    cột 16 chứa: Khác, Khách Gia, Xinh Mun
  tôn giáo   Export_20260812_B.xlsx    cột 16 chứa: Khác, Thiên Chúa, Bà La Môn
  nhân khẩu  bang 1 (2).ods            có cột cha/mẹ, không có cột giá trị thêm
  (bỏ qua)   KSV-ACTIVITY.xlsx         không có cột Họ và tên và Họ tên cha/mẹ
  (bỏ qua)   Ham if trong Power Query.xlsx   không có cột Họ và tên và Họ tên cha/mẹ
```

Bốn file trên đã bị đổi thành tên vô nghĩa, engine vẫn nhận đúng và cho ra file
CSV **giống hệt từng byte** so với khi chạy bằng tên gốc.

Tên file chỉ còn dùng làm trọng tài: nếu có hai file cùng nhận một vai (ví dụ
tải về hai bản nhân khẩu ở hai thời điểm) thì lấy file có từ khoá trong tên; hai
file đều không có từ khoá thì engine dừng và in cả hai ra để người dùng tự chọn
— thà dừng còn hơn chọn nhầm bản cũ.

Việc dò từng cột cũng theo nhãn tiêu đề, không theo số thứ tự cột
(`lib/population/cot.js`), nên hệ thống dân cư thêm hay đổi chỗ cột thì code
không phải sửa.

## Ánh xạ cột

| Cột `population` | Nguồn | Xử lý |
|---|---|---|
| `CCCD` **(khoá chính)** | Số ĐDCN/CCCD/CMND | đệm `0` cho đủ 12 số |
| `HOTEN` · `TENCHA` · `TENME` | Họ và tên, Họ tên cha, Họ tên mẹ | viết hoa, gọn khoảng trắng |
| `NAMSINH` | Ngày sinh | `DD/MM/YYYY` |
| `GIOITINH` | Giới tính | `Nam` → `true`, `Nữ` → `false` |
| `SOHOK` | Số HSCT | 6 số cuối: `26113-005676` → `005676` |
| `NOITHTRU` · `NOIOHIENTAI` | Nơi thường trú, Nơi ở hiện tại | cắt từ đoạn cấp xã trở về sau |
| `DANTOC` · `TONGIAO` | hai file lọc, ghép theo CCCD | viết hoa |
| `QUANHE` | suy từ cây gia đình trong hộ | 23 loại quan hệ — xem mục dưới |
| `GHICHU` | Trạng thái NK quản lý đặc thù | bỏ câu "Không thuộc diện quản lý…" |
| `SDT` | — | để trống, kết xuất không có |
| `VANGNHA` · `PRINTED` · `CRIMINALRECORD` | — | `false` |

## Năm cái bẫy trong dữ liệu nguồn

**1. File `.ods` bị LibreOffice đảo ngày ↔ tháng.** File `.ods` là bản `.xlsx`
gốc mở bằng LibreOffice rồi lưu lại. Lúc mở, LibreOffice đọc cột ngày theo
locale Mỹ: chuỗi `11/09/2010` thành ngày 9 tháng 11 và ghi xuống
`office:date-value="2010-09-11"`. Chỉ ô có ngày ≤ 12 mới lọt qua kiểu ngày,
phần còn lại nằm nguyên dạng chuỗi và vẫn đúng. Tức là: **ô kiểu ngày trong
`.ods` là ô đã hỏng, ô kiểu chuỗi thì còn nguyên.**

Đối chiếu với chính số serial trong `ton giao.xlsx` (bản kết xuất chưa qua
LibreOffice) trên 15.464 người có mặt ở cả hai file:

| Ô trong `.ods` | Số ô | Khớp nếu để nguyên | Khớp nếu đảo lại |
|---|---|---|---|
| kiểu ngày | 6.305 | 0 | **6.305** |
| kiểu chuỗi | 7.146 | **7.146** | — |

Đó là căn cứ để mặc định bật sửa. Nếu lần sau lấy thẳng `.xlsx` không qua
LibreOffice thì không có chuyện này — engine đọc `.xlsx` theo số serial nên
luôn đúng.

**2. CCCD mất số 0 đầu.** Ô CCCD là ô kiểu số, nên mã tỉnh `075` bị Excel nuốt
mất số 0: `075310019367` nằm trong file thành `75310019367`. Có cả trường hợp
mất hai số 0 (mã tỉnh `001`–`009`, còn 10 chữ số). Đệm `0` cho đủ 12 là khôi
phục đúng giá trị gốc — và bắt buộc, vì `CCCD` là khoá chính, sai một số là
người khác.

**3. Địa chỉ lặp hai lần nếu giữ nguyên.** ppv2web tự ghép
`", phường Hàng Gòn, thành phố Đồng Nai"` vào cuối `NOITHTRU` lúc sinh văn bản.
Engine cắt đoạn cấp xã trở về sau, nhưng **chỉ cắt đúng đoạn cấp xã**:

```
Tổ 14, KP Hàng Gòn, Phường Hàng Gòn, Tỉnh Đồng Nai  →  Tổ 14, KP Hàng Gòn
ẤP HÀNG GÒN XÃ HÀNG GÒN, TP LONG KHÁNH, ĐỒNG NAI    →  ẤP HÀNG GÒN
ấp Chiến Thắng, Xã Xuân Định, Tỉnh Đồng Nai         →  giữ nguyên (ngoài xã)
```

`KP Hàng Gòn`, `Khu phố Hàng Gòn`, `ấp Hàng Gòn` là tên khu phố — cắt nhầm là
mất mức địa chỉ chi tiết nhất. So khớp theo **từ** chứ không theo chuỗi con, và
đoạn trơ mỗi chữ `Hàng Gòn` chỉ được coi là cấp xã khi nó nằm ở cuối địa chỉ.

**4. Tiêu đề lặp giữa bảng.** Bản kết xuất chèn lại nguyên hàng tiêu đề sau mỗi
trang in — 242 lần trong file nhân khẩu. Lọc theo nội dung, không chỉ bỏ hàng
đầu tiên.

**5. Cột dân tộc / tôn giáo không có tiêu đề.** Hai file lọc có 15 cột đặt tên
rồi thêm một cột thứ 16 để trắng tiêu đề, chính là giá trị cần lấy. Engine lấy
theo vị trí (cột ngay sau cột cuối cùng có tên) và báo lỗi ngay nếu cột đó rỗng.

## Suy quan hệ với chủ hộ

Kết xuất không có cột quan hệ, nhưng mỗi người có **tên cha** và **tên mẹ**. Gom
theo số hộ khẩu là được một đồ thị nhỏ (trung bình 4–5 người), lần theo các cạnh
cha/mẹ là suy ra được quan hệ với chủ hộ. Toàn bộ nằm trong
`lib/population/quanhe.js`.

Chủ hộ được xác định bằng **CCCD** lấy từ `HO KHAU.xlsx`, không phải bằng tên —
tên thì trùng được, mà nhận sai chủ hộ là sai cả hộ.

Kết quả trên 5.378 hộ / 24.292 người: **23.296 người (95,9%)** suy được.

| | | | |
|---|---|---|---|
| `CHỦ HỘ` 5.353 | `CON` 9.207 | `CHÁU` 4.111 | `VỢ` 2.520 |
| `CON DÂU` 663 | `CHỒNG` 418 | `EM` 342 | `MẸ` 163 |
| `CHỊ` 134 | `ANH` 112 | `CON RỂ` 92 | `CHẮT` 78 |
| `CHA` 35 | `EM DÂU` 19 | `CHÁU DÂU` 13 | `CHỊ DÂU` 11 |
| `MẸ VỢ` 10 | `EM RỂ` 8 | `ANH RỂ` 3 | `MẸ CHỒNG` 3 |
| `CHA CHỒNG` 1 | | | để trống **996** |

Chín luật, chạy theo đúng thứ tự này — luật sau dựa vào kết quả luật trước, gán
rồi thì không gán lại:

| # | Luật | Suy ra |
|---|---|---|
| 1 | cha hoặc mẹ là chủ hộ | `CON` |
| 2 | tên trùng tên cha / mẹ của chủ hộ | `CHA` · `MẸ` |
| 3 | có con chung với chủ hộ | `VỢ` · `CHỒNG` |
| 4 | chung cha hoặc chung mẹ với chủ hộ, sinh trước/sau | `ANH` · `CHỊ` · `EM` |
| 5 | có con chung với một người `CON` | `CON DÂU` · `CON RỂ` |
| 6 | là cha / mẹ của vợ hoặc chồng chủ hộ | `CHA VỢ` · `MẸ VỢ` · `CHA CHỒNG` · `MẸ CHỒNG` |
| 7 | cha hoặc mẹ là `CON` / `CON DÂU` / `CON RỂ` / `ANH` / `CHỊ` / `EM` | `CHÁU`, đời sau nữa là `CHẮT` |
| 8 | có con chung với một người `CHÁU` / `ANH` / `CHỊ` / `EM` | `CHÁU DÂU/RỂ` · `CHỊ DÂU` · `ANH RỂ` · `EM DÂU/RỂ` |
| 9 | là cha / mẹ của người `CHA` / `MẸ` chủ hộ | `ÔNG` · `BÀ` |

Một hộ điền ra đúng như sau — 13 người, 8 loại quan hệ, không cần sửa tay chữ nào:

```
ANH      ĐỖ HUY SƠN        1977   cha=ĐỖ HUY DO  mẹ=NGUYỄN THỊ LÀI
CHỦ HỘ   ĐỖ HUY LAM        1980   cha=ĐỖ HUY DO  mẹ=NGUYỄN THỊ LÀI
EM       ĐỖ HUY NAM        1982   cha=ĐỖ HUY DO  mẹ=NGUYỄN THỊ LÀI
CHỊ DÂU  NGUYỄN THỊ THỦY   1984   ← có con chung với ĐỖ HUY SƠN (anh)
VỢ       TRỊNH THỊ HẠNH    1988   ← có con chung với chủ hộ
EM DÂU   MAI THỊ PHẤN      1989   ← có con chung với ĐỖ HUY NAM (em)
CON      ĐỖ HUY ĐẠT        2008   cha=ĐỖ HUY LAM
CHÁU     ĐỖ THỊ THU        2004   cha=ĐỖ HUY SƠN
```

### Bốn chỗ dễ sai, đã xử lý

**Cạnh nối bằng TÊN, không bằng CCCD.** Kết xuất chỉ ghi tên cha mẹ. Nên nếu một
hộ có hai người trùng tên thì mọi cạnh trỏ tới tên đó bị coi là không xác định —
thà bỏ trống hơn gán sai. Có 7 hộ như vậy.

**Anh chị em: chỉ cần trùng MỘT bên cha hoặc mẹ.** Đòi trùng cả hai thì mất 75
người, vì tên bên còn lại hay bị gõ lệch: `ĐỖ THỊ THỦY HỒNG` / `ĐỖ THỊ THÚY
HỒNG`, `TRẦN THỊ HOA` / `TRẦN THỊ NGỌC HOA`. Dù là anh em ruột gõ sai tên hay
anh em cùng cha khác mẹ thì nhãn vẫn là `ANH`/`CHỊ`/`EM`, nên nới ra không hại.

**Cháu trực hệ khác cháu bên ngang.** Con của người `CON` là cháu, con của người
đó nữa là `CHẮT`. Nhưng con của `ANH`/`CHỊ`/`EM` cũng gọi là cháu, mà con của
người đó thì vẫn là cháu chứ không lên chắt. Engine mang theo `đường` (trực hệ
hay nhánh ngang) để không đếm đời lẫn nhau.

**Chủ hộ vắng mặt.** 25 hộ có chủ hộ không còn trong danh sách nhân khẩu (đã mất
hoặc chuyển đi mà hộ chưa đổi chủ). Vẫn suy được **80/99 người** trong các hộ đó
bằng cách dựng một *nút ảo* chỉ có tên chủ hộ: đủ để nhận ra con và vợ/chồng của
người đó, còn các luật cần ngày sinh hay tên cha mẹ của chủ hộ thì tự động không
khớp nên không sinh suy diễn bừa.

### Soát lại kết quả

| Phép soát | Kết quả |
|---|---|
| Hộ có nhiều hơn một `CHỦ HỘ` | 0 |
| Hộ có nhiều hơn một `VỢ`/`CHỒNG` | 0 |
| Nhãn lệch giới tính (`VỢ` mà là nam, `CHA` mà là nữ…) | 0 |
| Hộ không xác định được chủ hộ | 0 |

## Những chỗ cố tình để trống

- **`QUANHE` của 996 người** — phần lớn là **nhà trọ**: nhiều gia đình không
  quan hệ gì với nhau cùng một số hộ, và người thuê thì không có cạnh nào nối
  tới chủ hộ. Số còn lại là hộ đứt mắt xích giữa — người con đã đi khỏi hộ, để
  lại con dâu và các cháu không lần được về chủ hộ. Cả hai trường hợp đều để
  trống cho cán bộ điền; đoán bừa ở đây là đưa dữ liệu sai vào giấy tờ.
- **`DANTOC` với `--kinh`** — chỉ suy ra `KINH` cho người **không có tên** trong
  file dân tộc. Người có tên nhưng bỏ trống ô, hoặc ghi "Chưa có thông tin",
  vẫn để trống. Không có cờ này thì 22.279 người để trống hết.
- **`TONGIAO`** — chỉ 13.451/24.292 người có trong file tôn giáo. Người không
  có trong đó để trống, không suy thành "Không".
- **`SDT`** — kết xuất không có số điện thoại.

## Nhập vào Supabase

Cách nhanh nhất là Table Editor → bảng `population` → *Insert* → *Import data
from CSV*. File 24 nghìn dòng nặng ~4,5 MB, nhập được nhưng chậm; muốn chắc thì
`--chia 5000` rồi nhập từng mẻ.

Bảng đang có sẵn dữ liệu thì đừng nhập thẳng — trùng `CCCD` là hỏng cả mẻ. Nhập
qua bảng tạm rồi upsert:

```sql
create table population_tam (like public.population including defaults);
-- Table Editor → import CSV vào population_tam

insert into public.population
select * from population_tam
on conflict ("CCCD") do update set
  "QUANHE"   = excluded."QUANHE",
  "HOTEN"    = excluded."HOTEN",
  "NAMSINH"  = excluded."NAMSINH",
  "GIOITINH" = excluded."GIOITINH",
  "SOHOK"    = excluded."SOHOK",
  "NOITHTRU" = excluded."NOITHTRU",
  "TENCHA"   = excluded."TENCHA",
  "TENME"    = excluded."TENME",
  "DANTOC"   = excluded."DANTOC",
  "TONGIAO"  = excluded."TONGIAO",
  "NOIOHIENTAI" = excluded."NOIOHIENTAI";
  -- cố ý KHÔNG ghi đè GHICHU, SDT, VANGNHA, PRINTED, CRIMINALRECORD:
  -- đó là dữ liệu cán bộ tự nhập, kết xuất không có

drop table population_tam;
```

Thứ tự cột trong CSV đúng bằng thứ tự cột của bảng nên `select *` chạy được.
Cần đối chiếu trước khi ghi đè thì thay `insert` bằng một câu `select` so hai
bảng.

Lưu ý trigger `sync_population_after_change` chạy **một lần cho mỗi dòng**, nên
nhập 24 nghìn dòng là 24 nghìn lần gọi `trigger_sync_population()`. Nếu hàm đó
gọi ra ngoài (webhook, đồng bộ sang bảng khác) thì tắt trigger trong lúc nhập
rồi đồng bộ lại một lượt:

```sql
alter table public.population disable trigger sync_population_after_change;
-- … nhập dữ liệu …
alter table public.population enable trigger sync_population_after_change;
```

## Kiểm chứng bản CSV

Bản `population.csv` sinh ra từ bốn file ngày 12/8/2026 đã được đối chiếu ngược
lại với chính hai file `.xlsx` gốc, trên 15.464 người có mặt ở cả hai nguồn:

| Trường đối chiếu | Số lệch |
|---|---|
| Ngày sinh (so với số serial trong `.xlsx`) | 0 |
| Họ tên · Giới tính · Tên cha · Tên mẹ | 0 |
| Số hồ sơ hộ khẩu (6 số cuối) | 0 |
| Dân tộc · Tôn giáo | 0 |

Và trên toàn bộ 24.292 bản ghi: không trùng `CCCD`, 100% `CCCD` đủ 12 chữ số,
100% `NAMSINH` đúng dạng `DD/MM/YYYY`, không dòng nào sai số cột.

## Hạn chế của luồng convert

- **Không đọc được `.xls`** (Excel 97 nhị phân). Lưu lại thành `.xlsx` hoặc
  `.ods` trước.
- **Chỉ đọc sheet đầu tiên** của mỗi file.
- **`ket-qua-dancu/` và mọi file `.csv` đều bị `.gitignore` chặn** — đây là dữ
  liệu công dân, không được đưa lên git. Đừng gỡ dòng đó ra.



Mở Terminal (Cmd + Space → gõ Terminal → Enter), dán nguyên hai dòng này rồi Enter:

  cd ~/Toan/code/bieu-mau
  npm run convert -- ~/Downloads ./ket-qua-dancu --kinh

  Chạy khoảng 10–15 giây, xong là in ra bảng thống kê và file nằm ở ~/Toan/code/bieu-mau/ket-qua-dancu/population.csv.

  Mở thư mục kết quả trong Finder cho nhanh:

  open ~/Toan/code/bieu-mau/ket-qua-dancu

  Vài lưu ý:

  - Dấu -- sau npm run convert là bắt buộc — thiếu nó thì npm nuốt hết phần đường dẫn phía sau, script không nhận được tham số nào.
  - Ba file nhan khau.ods, dan toc.xlsx, ton giao.xlsx phải còn nằm trong ~/Downloads (đang còn). Tải bản mới về cùng chỗ, giữ nguyên kiểu tên đó là chạy
  lại được ngay, file cũ bị ghi đè.
  - Chạy lại bao nhiêu lần cũng được, không đụng gì tới Supabase — script chỉ đọc file và ghi ra CSV.

  Nếu tiện hơn thì gõ thẳng trong khung chat này, thêm dấu ! ở đầu:

  !cd ~/Toan/code/bieu-mau && npm run convert -- ~/Downloads ./ket-qua-dancu --kinh