/**
 * GIAO DIỆN CỤC BỘ — cùng một engine, chỉ khác cách hỏi tham số.
 *
 *   npm run dev           rồi mở http://127.0.0.1:3000
 *   PORT=8080 npm run dev  đổi cổng khi 3000 đã bận
 *
 * Máy chủ chỉ nghe trên 127.0.0.1: nó đọc/ghi được cả ổ đĩa, nên không có lý do
 * gì để mở ra ngoài mạng. Không thêm thư viện nào — chỉ node:http và `lib/`.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillDocx } from '../lib/docx/fill.js';
import { banBaoCao } from '../lib/population/baocao.js';
import { CAC_DINH_DANG, chayChuyenDoi, quetNguon } from '../lib/population/chay.js';
import { CAC_VAI, tenVai } from '../lib/population/nguon.js';
import { FIELDS, SAMPLE_PROFILE, validate } from '../lib/profile.js';
import { SLOTS } from '../lib/slots/definitions.js';

const GOC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TRANG = path.join(GOC, 'ui', 'index.html');
const PORT = +(process.env.PORT || 3000);

/** Nhớ kết quả nhận dạng giữa các lần quét — xem `nhanDangFiles`. */
const BO_NHO_NHAN_DANG = new Map();

const LA_DOCX = (f) => /\.docx$/i.test(f) && !f.startsWith('~') && !f.startsWith('.');
const LA_BANG_TINH = (f) => /\.(ods|xlsx)$/i.test(f) && !f.startsWith('~') && !f.startsWith('.');

/** Tách đường dẫn người dùng gõ: mỗi dòng một mục, cho phép dán nhiều file. */
const tachNguon = (s) =>
  String(s ?? '')
    .split(/\r?\n/)
    .map((x) => x.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);

function kiemTraTonTai(ds) {
  const thieu = ds.filter((p) => !fs.existsSync(p));
  if (thieu.length) throw new Error('Không thấy đường dẫn: ' + thieu.join(', '));
}

/** Giờ phút giây, để dòng log biết được lượt nào chạy lúc nào. */
const gio = () => new Date().toLocaleTimeString('vi-VN');

/** Tên định dạng cho dòng log và cho ô chọn trên trang. */
const TEN_DINH_DANG = { csv: 'CSV', json: 'JSON', caHai: 'CSV + JSON' };

// ─── API ────────────────────────────────────────────────────────────────────

const API = {
  /** Dữ liệu để dựng form: form hồ sơ tự sinh từ FIELDS, nên thêm trường là form tự có ô. */
  'khoi-dong': () => ({
    thuMucLamViec: GOC,
    home: os.homedir(),
    fields: FIELDS,
    mau: SAMPLE_PROFILE,
    vai: CAC_VAI.map((v) => ({ ma: v, ten: tenVai(v) })),
    dinhDang: CAC_DINH_DANG.map((d) => ({ ma: d, ten: TEN_DINH_DANG[d] ?? d })),
    slots: SLOTS.map((s) => ({
      id: s.id,
      label: s.label,
      pack: s.pack ?? 'khac',
      batSan: s.default ?? true,
    })),
  }),

  /** Duyệt thư mục — để khỏi phải gõ tay đường dẫn Windows dài loằng ngoằng. */
  'thu-muc': ({ p }) => {
    const goc = p ? path.resolve(p) : os.homedir();
    if (!fs.existsSync(goc) || !fs.statSync(goc).isDirectory()) {
      throw new Error(`Không phải thư mục: ${goc}`);
    }
    const muc = [];
    let docx = 0;
    let bangTinh = 0;
    for (const ten of fs.readdirSync(goc).sort()) {
      let st;
      try {
        st = fs.statSync(path.join(goc, ten));
      } catch {
        continue; // file bị khoá quyền — bỏ qua, không làm hỏng cả danh sách
      }
      if (st.isDirectory()) {
        if (!ten.startsWith('.')) muc.push({ ten, duongDan: path.join(goc, ten) });
      } else if (LA_DOCX(ten)) docx++;
      else if (LA_BANG_TINH(ten)) bangTinh++;
    }
    const cha = path.dirname(goc);
    return { duongDan: goc, cha: cha === goc ? null : cha, muc, docx, bangTinh };
  },

  /** Nhận dạng nguồn dân cư, KHÔNG đọc trọn file — để người dùng soát trước khi chạy. */
  'dan-cu/quet': ({ nguon, chiDinh = {}, doiNgayThang = true }) => {
    const ds = tachNguon(nguon);
    if (!ds.length) throw new Error('Chưa chọn thư mục hoặc file nguồn.');
    kiemTraTonTai(ds);
    const kq = quetNguon(ds, { chiDinh, doiNgayThang, boNho: BO_NHO_NHAN_DANG });
    const vaiChon = {};
    for (const vai of CAC_VAI) if (kq.chon[vai]) vaiChon[path.resolve(kq.chon[vai])] = vai;
    return {
      daNgo: kq.daNgo.map((n) => {
        const dang = vaiChon[path.resolve(n.file)] ?? '';
        return { ten: n.ten, file: n.file, doan: n.vai, dang, boi: dang ? kq.boi[dang] : '', dauHieu: n.dauHieu };
      }),
      chon: kq.chon,
      boi: kq.boi,
      ghiChu: kq.ghiChu,
      loi: kq.loi,
    };
  },

  'dan-cu/chay': ({
    nguon,
    chiDinh = {},
    outDir,
    donVi,
    kinh,
    chia,
    doiNgayThang = true,
    dinhDang = 'csv',
  }) => {
    const ds = tachNguon(nguon);
    if (!ds.length) throw new Error('Chưa chọn thư mục hoặc file nguồn.');
    if (!String(outDir ?? '').trim()) throw new Error('Chưa chọn thư mục lưu kết quả.');
    kiemTraTonTai(ds);

    const quet = quetNguon(ds, { chiDinh, doiNgayThang, boNho: BO_NHO_NHAN_DANG });
    if (quet.loi.length) throw new Error(quet.loi.join('\n'));

    const kq = chayChuyenDoi({
      chon: quet.chon,
      outDir: path.resolve(outDir),
      donVi: String(donVi ?? '').trim() || 'Hàng Gòn',
      macDinhKinh: !!kinh,
      chia: +chia || 0,
      doiNgayThang,
      dinhDang,
    });

    // Cùng bản báo cáo mà dòng lệnh in ra: vừa đẩy về trang, vừa in ra terminal
    // đang chạy `npm run dev` để còn cuộn lại xem những lượt trước.
    const baoCao = banBaoCao(kq, { doiNgayThang });
    console.log(`
[${gio()}] Tạo ${TEN_DINH_DANG[dinhDang] ?? dinhDang} — nguồn ${path.basename(quet.chon.nhanKhau)}${baoCao}`);

    return {
      chon: quet.chon,
      ghiChu: quet.ghiChu,
      soBanGhi: kq.banGhi.length,
      soCanhBao: kq.canhBao.length,
      thongKe: kq.thongKe,
      thongKeNgay: kq.thongKeNgay,
      tenFile: kq.tenFile,
      outDir: kq.outDir,
      dinhDang: kq.dinhDang,
      baoCao,
    };
  },

  /** Đếm ô sẽ điền mà KHÔNG ghi file — soát trước khi đụng vào thư mục đích. */
  'bieu-mau/quet': ({ nguon, profile = {}, slotOverrides = {} }) => {
    const { files, baseDir } = gomDocx(nguon);
    const ho = { ...SAMPLE_PROFILE, ...profile };
    const ketQua = [];
    for (const ten of files) {
      try {
        const r = fillDocx(fs.readFileSync(path.join(baseDir, ten)), ho, {
          slotOverrides,
          dryRun: true,
        });
        ketQua.push({ ten, so: r.hits.length, o: r.hits.slice(0, 40) });
      } catch (loi) {
        ketQua.push({ ten, so: 0, loi: loi.message });
      }
    }
    return { ketQua, tong: ketQua.reduce((a, b) => a + b.so, 0), thieu: validate(ho) };
  },

  'bieu-mau/chay': ({ nguon, outDir, profile = {}, slotOverrides = {} }) => {
    if (!String(outDir ?? '').trim()) throw new Error('Chưa chọn thư mục lưu kết quả.');
    const ho = { ...profile };
    const thieu = validate(ho);
    if (thieu.length) throw new Error('Hồ sơ đơn vị thiếu trường bắt buộc: ' + thieu.join(', '));

    const { files, baseDir } = gomDocx(nguon);
    const dich = path.resolve(outDir);
    if (path.resolve(baseDir) === dich) {
      throw new Error('Thư mục lưu kết quả trùng thư mục nguồn — sẽ ghi đè lên mẫu gốc.');
    }
    fs.mkdirSync(dich, { recursive: true });

    const ketQua = [];
    for (const ten of files) {
      try {
        const r = fillDocx(fs.readFileSync(path.join(baseDir, ten)), ho, { slotOverrides });
        fs.writeFileSync(path.join(dich, ten), r.buffer);
        ketQua.push({ ten, so: r.hits.length, o: r.hits.slice(0, 40) });
      } catch (loi) {
        ketQua.push({ ten, so: 0, loi: loi.message });
      }
    }
    const tong = ketQua.reduce((a, b) => a + b.so, 0);
    const hong = ketQua.filter((k) => k.loi);
    console.log(
      `
[${gio()}] Điền biểu mẫu — ${files.length} file, ${tong} ô → ${dich}` +
        (hong.length ? `
  ${hong.length} file lỗi: ${hong.map((k) => k.ten).join(', ')}` : ''),
    );
    return { ketQua, tong, outDir: dich };
  },
};

/** Danh sách .docx từ một thư mục, hoặc từ chính các file được trỏ tới. */
function gomDocx(nguon) {
  const ds = tachNguon(nguon);
  if (!ds.length) throw new Error('Chưa chọn thư mục hoặc file biểu mẫu.');
  kiemTraTonTai(ds);

  if (ds.length === 1 && fs.statSync(ds[0]).isDirectory()) {
    const files = fs.readdirSync(ds[0]).filter(LA_DOCX).sort();
    if (!files.length) throw new Error(`Thư mục không có file .docx nào: ${ds[0]}`);
    return { files, baseDir: ds[0] };
  }
  const baseDir = path.dirname(ds[0]);
  const files = ds.map((p) => path.basename(p));
  const lac = ds.find((p) => path.dirname(p) !== baseDir);
  if (lac) throw new Error('Chọn nhiều file thì các file phải nằm cùng một thư mục.');
  return { files, baseDir };
}

// ─── Máy chủ ────────────────────────────────────────────────────────────────

/**
 * `JSON.parse` ném ngay trong trình xử lý sự kiện, không rơi vào executor của
 * Promise — không bắt ở đây thì một yêu cầu hỏng là sập cả máy chủ.
 */
const docThan = (req) =>
  new Promise((ok, that) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 4e6) that(new Error('Yêu cầu quá lớn'));
    });
    req.on('end', () => {
      try {
        ok(s ? JSON.parse(s) : {});
      } catch {
        that(new Error('Thân yêu cầu không phải JSON hợp lệ'));
      }
    });
    req.on('error', that);
  });

const traJson = (res, ma, data) => {
  const s = JSON.stringify(data);
  res.writeHead(ma, { 'content-type': 'application/json; charset=utf-8' });
  res.end(s);
};

const may = http.createServer(async (req, res) => {
  const duong = new URL(req.url, 'http://127.0.0.1').pathname;

  if (duong === '/' || duong === '/index.html') {
    // Đọc lại mỗi lần: sửa giao diện thì F5 là thấy, khỏi khởi động lại máy chủ.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(TRANG));
    return;
  }

  if (duong.startsWith('/api/')) {
    const ten = duong.slice(5);
    const ham = API[ten];
    if (!ham) return traJson(res, 404, { loi: `Không có API "${ten}"` });
    try {
      const than = req.method === 'POST' ? await docThan(req) : {};
      traJson(res, 200, ham(than));
    } catch (loi) {
      traJson(res, 400, { loi: loi.message });
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Không có trang này');
});

// Chạy lại khi lần trước chưa tắt là chuyện thường ngày — nói rõ phải làm gì,
// đừng đổ ra một vệt stack trace.
may.on('error', (loi) => {
  if (loi.code === 'EADDRINUSE') {
    console.error(
      `\n  Cổng ${PORT} đang có tiến trình khác giữ.\n` +
        `  Nếu đó là giao diện lần trước: mở http://127.0.0.1:${PORT} là dùng được luôn,\n` +
        `  hoặc tắt nó đi rồi chạy lại. Muốn cổng khác: PORT=${PORT + 1} npm run dev\n`,
    );
    process.exit(1);
  }
  throw loi;
});

may.listen(PORT, '127.0.0.1', () => {
  console.log(`
  Giao diện điền biểu mẫu / tạo CSV, JSON dân cư
  → http://127.0.0.1:${PORT}

  Chỉ nghe trên máy này. Ctrl+C để dừng.
`);
});
