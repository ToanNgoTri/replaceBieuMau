/**
 * CHỌN NGUỒN — file nào đóng vai bảng nào.
 *
 * Nhận dạng theo nội dung (`nhandang.js`) đúng trong đa số trường hợp, nhưng
 * bản kết xuất mỗi nơi mỗi khác: thêm bớt cột, đổi nhãn tiêu đề, gộp hai bảng
 * làm một. Khi đó phải cho người dùng CHỈ ĐỊNH THẲNG vai của từng file.
 *
 * Module này là chỗ duy nhất biết luật ghép nguồn, để CLI (`scripts/convert.mjs`)
 * và giao diện (`scripts/ui.mjs`) không trôi lệch nhau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { docOds } from '../sheet/ods.js';
import { docXlsx } from '../sheet/xlsx.js';
import { khongDau } from './fields.js';
import { nhanDang, tenVai } from './nhandang.js';

/** Thứ tự cố định — dùng cho vòng lặp và cho thứ tự hiển thị trên giao diện. */
export const CAC_VAI = ['nhanKhau', 'danToc', 'tonGiao', 'hoKhau', 'daXoa'];

/** Tên viết tắt người dùng gõ ngoài dòng lệnh / chọn trên giao diện. */
export const VIET_TAT = { nk: 'nhanKhau', hk: 'hoKhau', dt: 'danToc', tg: 'tonGiao', xoa: 'daXoa' };

/**
 * TÊN FILE CHỈ LÀ GỢI Ý, KHÔNG BAO GIỜ LÀ CĂN CỨ CHÍNH.
 *
 * Nội dung mới là thứ đáng tin: bản kết xuất đổi tên theo từng lần tải về. Nhưng
 * có những file nội dung không đủ dấu hiệu để kết luận — `congDanTheoDanToc.xlsx`
 * thiếu cột cha/mẹ nên `nhandang.js` bỏ qua, dù cái tên đã nói toạc ra nó là gì.
 * Với những file đó, tên là thứ duy nhất còn lại.
 *
 * Ưu tiên: **chỉ định tay > nội dung > tên file**. Tên chỉ được lên tiếng khi
 * nội dung đã im lặng, và không bao giờ kéo được một file mà nội dung đã xếp
 * vào vai khác.
 *
 * Đây là DỮ LIỆU, không phải luật — đơn vị nào đặt tên kiểu khác thì thêm từ
 * khoá vào đây, không phải sửa code. Từ khoá đã bỏ dấu và bỏ hết ký tự ngăn
 * cách, nên "Dân tộc", "dan-toc", "DANTOC" đều khớp 'dantoc'.
 */
export const GOI_Y_TEN = {
  nhanKhau: ['nhankhau', 'toanbonhankhau', 'danhsachnhankhau'],
  hoKhau: ['hokhau', 'danhsachho', 'chuho'],
  danToc: ['dantoc'],
  tonGiao: ['tongiao'],
  daXoa: ['xoa'],
};

/**
 * Tên file khớp vai này không?
 *
 * Hai lối khớp, và lối đầu phải là KHỚP TRỌN chứ không phải chứa:
 *
 *   `nk.xlsx`  → đúng mã ngắn của vai, tên đặt kiểu này là cố ý
 *   `DS nhan khau.ods` → chứa từ khoá dài trong GOI_Y_TEN
 *
 * Mã ngắn chỉ có hai chữ nên tuyệt đối không được so kiểu "chứa": "nhankhau"
 * chứa cả "nk", "tg cong giao" bắt đầu bằng "tg" mà lại không phải bảng tôn
 * giáo. Khớp trọn thì `nk.xlsx` là nk, còn `tg cong giao.xlsx` không là gì cả.
 */
function khopTen(ten, vai) {
  const g = gonTen(ten.replace(/\.[^.]+$/, ''));
  if (g === MA_NGAN[vai]) return true;
  return GOI_Y_TEN[vai].some((tu) => g.includes(tu));
}

/** Mã ngắn của từng vai — mặt kia của bảng VIET_TAT. */
const MA_NGAN = Object.fromEntries(Object.entries(VIET_TAT).map(([tat, vai]) => [vai, tat]));

/**
 * Vai đoán được từ tên file, hoặc rỗng.
 *
 * Tên khớp hai vai thì trả về rỗng chứ không chọn bừa: `congDanTheoDanToc` vừa
 * chứa "congdan" vừa chứa "dantoc" — đoán mò ở đây là cách chắc chắn nhất để
 * nhét nhầm bảng vào đường ống. Thà im lặng để người dùng chọn tay.
 */
export function vaiTheoTen(ten) {
  const khop = CAC_VAI.filter((vai) => khopTen(ten, vai));
  return khop.length === 1 ? khop[0] : '';
}

/** Chỉ nhân khẩu là bắt buộc; ba bảng kia thiếu thì chỉ mất phần dữ liệu đó. */
export const BAT_BUOC = { nhanKhau: true, danToc: false, tonGiao: false, hoKhau: false, daXoa: false };

/**
 * BẢNG NHÂN KHẨU ĐÃ XOÁ GIỐNG HỆT BẢNG NHÂN KHẨU — TỪNG CỘT MỘT.
 *
 * `nk xoa.xlsx` và `nk.xlsx` cùng một hàng tiêu đề, nên nội dung không có cách
 * nào nói được file nào là danh sách đang ở, file nào là danh sách đã xoá. Cái
 * tên là dấu hiệu duy nhất, nên ở đây — và chỉ ở đây — tên được phép lật kết
 * quả nhận dạng: nội dung nói "nhân khẩu" + tên có chữ "xoá" → bảng đã xoá.
 *
 * Không lật thì hai file cùng tranh vai nhân khẩu, và nếu tên không phân xử
 * được thì người đã xoá bị trộn lẫn vào danh sách đang ở mà không ai hay.
 */
function tachBangXoa(ten, ra) {
  if (ra.vai !== 'nhanKhau' || !khopTen(ten, 'daXoa')) return ra;
  return { vai: 'daXoa', dauHieu: 'cùng dạng bảng nhân khẩu, tên file ghi "xoá"' };
}

const LA_BANG_TINH = /\.(ods|xlsx)$/i;

/** Rút gọn tên file cho dễ so khớp: bỏ dấu, bỏ mọi ký tự không phải chữ và số. */
const gonTen = (s) => khongDau(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Gom danh sách file bảng tính từ các đường dẫn truyền vào (file hoặc thư mục). */
export function gomFile(duongDan) {
  const out = [];
  for (const p of duongDan) {
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) {
        if (LA_BANG_TINH.test(f) && !f.startsWith('~') && !f.startsWith('.')) {
          out.push(path.join(p, f));
        }
      }
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * Đọc một file bảng tính thành mảng hàng.
 *
 * `gioiHan` > 0 thì chỉ đọc bấy nhiêu hàng đầu — đủ để nhận dạng, và nhanh hơn
 * hẳn khi thư mục Tải về có mấy chục bảng tính không liên quan.
 */
export function docBang(file, { doiNgayThang = true, thongKe = {}, gioiHan = 0 } = {}) {
  const buf = fs.readFileSync(file);
  if (/\.ods$/i.test(file)) return docOds(buf, { doiNgayThang, thongKe, gioiHan });
  return docXlsx(buf, { gioiHan });
}

/** Số hàng đầu đủ để thấy tiêu đề và nếm thử cột giá trị. */
export const NGO_SO_HANG = 400;

/**
 * Ngó qua từng file, đoán vai của nó.
 *
 * `boNho` là Map nhớ kết quả theo đường dẫn + thời điểm sửa + cỡ file. Giao
 * diện quét lại sau mỗi lần người dùng đổi vai một file; không có nó thì mỗi
 * cú nhấp phải giải nén lại cả thư mục bảng tính.
 *
 * @returns {{file: string, ten: string, vai: string, dauHieu: string}[]}
 *   `vai` rỗng nghĩa là không nhận ra — vẫn liệt kê để người dùng tự gán.
 */
export function nhanDangFiles(files, { doiNgayThang = true, boNho = null } = {}) {
  const daNgo = [];
  for (const file of files) {
    const ten = path.basename(file);
    let khoa = null;
    if (boNho) {
      const st = fs.statSync(file);
      khoa = `${path.resolve(file)}|${st.mtimeMs}|${st.size}|${doiNgayThang}`;
      const cu = boNho.get(khoa);
      if (cu) {
        daNgo.push({ file, ten, ...tachBangXoa(ten, cu) });
        continue;
      }
    }
    let ra;
    try {
      ra = nhanDang(docBang(file, { doiNgayThang, gioiHan: NGO_SO_HANG }));
    } catch (loi) {
      ra = { vai: '', dauHieu: `không đọc được: ${loi.message}` };
    }
    if (khoa) boNho.set(khoa, ra);
    daNgo.push({ file, ten, ...tachBangXoa(ten, ra) });
  }
  return daNgo;
}

/**
 * Tìm file người dùng chỉ định, cho gõ đường dẫn đầy đủ hoặc chỉ một mẩu tên.
 *
 * Gõ tay cả đường dẫn dài rất dễ sai một dấu, nên chấp nhận cả tên rút gọn —
 * miễn là chỉ khớp đúng một file thì không có gì mơ hồ để mà đoán sai.
 */
export function timFile(daNgo, chuoi) {
  const s = String(chuoi ?? '').trim();
  if (!s) return { file: null };

  const trung = daNgo.find((n) => path.resolve(n.file) === path.resolve(s));
  if (trung) return { file: trung.file };

  const goi = gonTen(s);
  if (!goi) return { file: null, loi: `không hiểu "${s}".` };

  const bangTen = daNgo.filter((n) => gonTen(n.ten) === goi);
  const chuaTen = bangTen.length ? bangTen : daNgo.filter((n) => gonTen(n.ten).includes(goi));

  if (chuaTen.length === 1) return { file: chuaTen[0].file };
  if (chuaTen.length > 1) {
    return {
      file: null,
      loi: `"${s}" khớp ${chuaTen.length} file: ${chuaTen.map((n) => n.ten).join(', ')}.`,
    };
  }
  // Ngoài danh sách đã ngó — có thể là file người dùng trỏ thẳng tới.
  if (fs.existsSync(s) && fs.statSync(s).isFile()) return { file: s };
  return { file: null, loi: `không tìm thấy file nào khớp "${s}".` };
}

/**
 * Quyết định file nào đóng vai nào.
 *
 * Chỉ định tay luôn thắng nhận dạng tự động, kể cả khi nội dung file trông như
 * một vai khác — người ngồi trước màn hình biết bản kết xuất của mình rõ hơn
 * bất kỳ luật đoán nào viết sẵn ở đây.
 *
 * @param {object} chiDinh vai → đường dẫn hoặc mẩu tên file, ví dụ `{nk: 'nhankhau.ods'}`
 * @returns {{chon: object, boi: object, ghiChu: string[], loi: string[]}}
 *   `boi` cho biết mỗi vai được chốt nhờ đâu: 'tay' | 'nội dung' | 'tên file'
 */
export function chonNguon(daNgo, chiDinh = {}) {
  const chon = {};
  const boi = {};
  const ghiChu = [];
  const loi = [];

  // Cho gõ cả tên viết tắt (nk, hk, dt, tg) lẫn tên đầy đủ (nhanKhau...).
  const tay = {};
  for (const [k, v] of Object.entries(chiDinh)) {
    const vai = VIET_TAT[k.toLowerCase()] ?? (CAC_VAI.includes(k) ? k : null);
    if (!vai) {
      loi.push(`Không có vai "${k}". Chỉ có: ${Object.keys(VIET_TAT).join(', ')}.`);
      continue;
    }
    if (String(v ?? '').trim()) tay[vai] = String(v).trim();
  }

  const daGan = new Set();
  for (const vai of CAC_VAI) {
    if (!(vai in tay)) continue;
    const { file, loi: sai } = timFile(daNgo, tay[vai]);
    if (!file) {
      loi.push(`Bảng ${tenVai(vai)}: ${sai}`);
      continue;
    }
    chon[vai] = file;
    boi[vai] = 'tay';
    daGan.add(path.resolve(file));
    const doan = daNgo.find((n) => path.resolve(n.file) === path.resolve(file));
    if (doan && doan.vai && doan.vai !== vai) {
      ghiChu.push(
        `${path.basename(file)}: chỉ định là bảng ${tenVai(vai)}, ` +
          `nội dung trông như bảng ${tenVai(doan.vai)} — lấy theo chỉ định.`,
      );
    }
  }

  // Tầng 2 — nội dung. Bỏ qua file đã bị gán tay cho vai khác.
  for (const vai of CAC_VAI) {
    if (chon[vai]) continue;
    const ds = daNgo.filter((n) => n.vai === vai && !daGan.has(path.resolve(n.file)));
    if (!ds.length) {
      chon[vai] = null;
      continue;
    }
    if (ds.length === 1) {
      chon[vai] = ds[0].file;
      boi[vai] = 'nội dung';
      daGan.add(path.resolve(ds[0].file));
      continue;
    }
    const theoTen = ds.filter((n) => khopTen(n.ten, vai));
    if (theoTen.length === 1) {
      chon[vai] = theoTen[0].file;
      boi[vai] = 'nội dung';
      daGan.add(path.resolve(theoTen[0].file));
      ghiChu.push(
        `${ds.length} file trông đều giống bảng ${tenVai(vai)} ` +
          `(${ds.map((n) => n.ten).join(', ')}) — chọn ${theoTen[0].ten} theo tên.`,
      );
      continue;
    }
    chon[vai] = null;
    loi.push(
      `Có ${ds.length} file cùng là bảng ${tenVai(vai)}: ${ds.map((n) => n.ten).join(', ')}. ` +
        'Chỉ định thẳng file cần dùng để khỏi lẫn.',
    );
  }

  /**
   * Tầng 3 — tên file, chỉ dành cho vai mà nội dung không nói được gì.
   *
   * Chỉ xét những file CHÍNH NÓ cũng không nhận ra là bảng gì. File đã được nội
   * dung xếp vào một vai thì không đời nào bị tên kéo sang vai khác — nội dung
   * đọc được là bằng chứng, tên chỉ là cái nhãn ai đó gõ vội.
   *
   * Đoán sai ở đây không âm thầm hỏng dữ liệu: `dinhViCot` đòi đủ cột bắt buộc,
   * nhét nhầm bảng vào là báo lỗi ngay chứ không cho ra CSV rác.
   */
  for (const vai of CAC_VAI) {
    if (chon[vai]) continue;
    const ds = daNgo.filter(
      (n) => !n.vai && !daGan.has(path.resolve(n.file)) && vaiTheoTen(n.ten) === vai,
    );
    if (ds.length !== 1) continue;
    chon[vai] = ds[0].file;
    boi[vai] = 'tên file';
    daGan.add(path.resolve(ds[0].file));
    ghiChu.push(
      `${ds[0].ten}: nội dung không đủ dấu hiệu, nhận là bảng ${tenVai(vai)} theo TÊN FILE. ` +
        'Sai thì chỉ định lại vai cho file đó.',
    );
  }

  if (!chon.nhanKhau && !loi.some((l) => l.includes('nhân khẩu'))) {
    loi.push(
      'Không có file nào là bảng nhân khẩu. Bảng nhân khẩu là bảng có đủ cột ' +
        '"Họ và tên", "Họ tên cha", "Họ tên mẹ" và không có cột dân tộc/tôn giáo kèm theo. ' +
        'Nếu bản kết xuất đặt nhãn khác, chỉ định thẳng file cho vai nk.',
    );
  }
  return { chon, boi, ghiChu, loi };
}

/** Đọc trọn các bảng đã chọn. Chỉ file nhân khẩu đang ở mới góp vào thống kê sửa lỗi ngày. */
export function docNguon(chon, { doiNgayThang = true, thongKeNgay = {} } = {}) {
  return {
    nhanKhau: docBang(chon.nhanKhau, { doiNgayThang, thongKe: thongKeNgay }),
    danToc: chon.danToc ? docBang(chon.danToc, { doiNgayThang }) : null,
    tonGiao: chon.tonGiao ? docBang(chon.tonGiao, { doiNgayThang }) : null,
    hoKhau: chon.hoKhau ? docBang(chon.hoKhau, { doiNgayThang }) : null,
    daXoa: chon.daXoa ? docBang(chon.daXoa, { doiNgayThang }) : null,
  };
}

export { tenVai };
