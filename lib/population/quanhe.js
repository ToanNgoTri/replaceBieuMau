/**
 * SUY QUAN HỆ VỚI CHỦ HỘ TỪ CÂY GIA ĐÌNH TRONG HỘ.
 *
 * Bảng kết xuất không có cột quan hệ, nhưng mỗi người có tên cha và tên mẹ. Gom
 * theo số hộ khẩu là được một đồ thị nhỏ (trung bình 4–5 người), suy ngược ra
 * quan hệ với chủ hộ bằng cách lần theo các cạnh cha/mẹ.
 *
 * Cạnh nối bằng TÊN, không bằng CCCD — kết xuất chỉ ghi tên cha mẹ. Nên trong
 * một hộ mà có hai người trùng tên thì mọi cạnh trỏ tới tên đó bị coi là không
 * xác định, thà bỏ trống hơn gán sai (`traTen` trả về `null`).
 *
 * Thứ tự các luật là thứ tự ưu tiên: gán rồi thì không gán lại. Luật đứng trước
 * luôn chắc chắn hơn luật đứng sau, vì luật sau dựa vào kết quả của luật trước.
 */

/** Đời theo trực hệ, để phân biệt cháu (đời 2) với chắt (đời 3). */
const TRUC_HE = 'truc';
/** Nhánh ngang: con của anh/chị/em chủ hộ — vẫn gọi là cháu, không lên chắt. */
const NHANH_NGANG = 'ngang';

/**
 * @param {object[]} ds người trong hộ — `{cccd, ten, nam, moc, cha, me}`
 *   `nam` = true nếu là nam, `moc` = số so sánh được của ngày sinh
 * @param {object} chuHo `{cccd, ten}` — có `cccd` thì chắc chắn, không thì dò tên
 * @returns {Map<string, string>} cccd → quan hệ; không suy được thì không có khoá
 */
export function suyQuanHeTrongHo(ds, chuHo) {
  const nut = ds.map((p) => ({ p, qh: '', duong: '', doi: 0 }));

  // Tra tên → nút. Tên xuất hiện hai lần trong hộ thì thành null vĩnh viễn.
  const theoTen = new Map();
  for (const n of nut) {
    if (theoTen.has(n.p.ten)) theoTen.set(n.p.ten, null);
    else theoTen.set(n.p.ten, n);
  }
  const traTen = (ten) => (ten ? theoTen.get(ten) ?? null : null);

  const ch = timChuHo(nut, traTen, chuHo);
  if (!ch) return new Map();
  gan(ch, 'CHỦ HỘ', TRUC_HE, 0);

  // ── 1. Con của chủ hộ ────────────────────────────────────────────────────
  for (const n of nut) {
    if (!n.qh && laConCua(n.p, ch.p.ten)) gan(n, 'CON', TRUC_HE, 1);
  }

  // ── 2. Cha / mẹ của chủ hộ ───────────────────────────────────────────────
  for (const [truong, nhan] of [['cha', 'CHA'], ['me', 'MẸ']]) {
    const n = traTen(ch.p[truong]);
    if (n && !n.qh) gan(n, nhan, TRUC_HE, -1);
  }

  // ── 3. Vợ / chồng: người cùng có con với chủ hộ ───────────────────────────
  const banDoiChuHo = [];
  for (const n of nut) {
    if (n.qh !== 'CON') continue;
    const bd = traTen(tenChaMeConLai(n.p, ch.p.ten));
    if (bd && !bd.qh && bd.p.nam !== ch.p.nam) {
      gan(bd, bd.p.nam ? 'CHỒNG' : 'VỢ', TRUC_HE, 0);
      banDoiChuHo.push(bd);
    }
  }

  // ── 4. Anh / chị / em: chung cha hoặc chung mẹ với chủ hộ ─────────────────
  // Chỉ cần trùng MỘT bên. Trùng cả hai là anh em ruột; trùng một bên thì hoặc
  // là anh em cùng cha khác mẹ, hoặc tên bên kia bị gõ lệch — cả hai trường
  // hợp vẫn là anh/chị/em, nên không cần phân biệt.
  for (const n of nut) {
    if (n.qh) continue;
    const chungCha = n.p.cha && n.p.cha === ch.p.cha;
    const chungMe = n.p.me && n.p.me === ch.p.me;
    if (chungCha || chungMe) gan(n, thuBac(n.p, ch.p), NHANH_NGANG, 0);
  }

  // ── 5. Con dâu / con rể: người cùng có con với một người CON ──────────────
  for (const { a, b } of capChaMe(nut, traTen)) {
    if (a.qh === 'CON' && !b.qh && b.p.nam !== a.p.nam) {
      gan(b, b.p.nam ? 'CON RỂ' : 'CON DÂU', TRUC_HE, 1);
    }
  }

  // ── 6. Cha / mẹ của vợ hoặc chồng chủ hộ ─────────────────────────────────
  for (const bd of banDoiChuHo) {
    const ben = bd.p.nam ? 'CHỒNG' : 'VỢ';
    for (const [truong, nhan] of [['cha', 'CHA'], ['me', 'MẸ']]) {
      const n = traTen(bd.p[truong]);
      if (n && !n.qh) gan(n, `${nhan} ${ben}`, TRUC_HE, -1);
    }
  }

  // ── 7. Cháu → chắt, và vợ/chồng của cháu ─────────────────────────────────
  // Chạy hai lượt vì cháu của cháu chỉ hiện ra sau khi lớp cháu đã được gán.
  const SINH_RA_CHAU = new Set(['CON', 'CON DÂU', 'CON RỂ', 'ANH', 'CHỊ', 'EM']);
  for (let lan = 0; lan < 2; lan++) {
    for (const n of nut) {
      if (n.qh) continue;
      const cha = traTen(n.p.cha);
      const me = traTen(n.p.me);
      const bo = [cha, me].find((x) => x && (SINH_RA_CHAU.has(x.qh) || x.qh === 'CHÁU'));
      if (!bo) continue;

      // Con của cháu trực hệ là chắt. Con của cháu bên nhánh ngang vẫn là cháu.
      if (bo.qh === 'CHÁU') gan(n, bo.duong === TRUC_HE ? 'CHẮT' : 'CHÁU', bo.duong, bo.doi + 1);
      else gan(n, 'CHÁU', bo.duong, bo.doi + 1);
    }
    for (const { a, b } of capChaMe(nut, traTen)) {
      if (a.qh === 'CHÁU' && !b.qh && b.p.nam !== a.p.nam) {
        gan(b, b.p.nam ? 'CHÁU RỂ' : 'CHÁU DÂU', a.duong, a.doi);
      }
    }
  }

  // ── 8. Anh/chị/em dâu, rể ────────────────────────────────────────────────
  const DAU_RE = { ANH: 'CHỊ DÂU', CHỊ: 'ANH RỂ', EM: null };
  for (const { a, b } of capChaMe(nut, traTen)) {
    if (!(a.qh in DAU_RE) || b.qh || b.p.nam === a.p.nam) continue;
    gan(b, DAU_RE[a.qh] ?? (b.p.nam ? 'EM RỂ' : 'EM DÂU'), NHANH_NGANG, 0);
  }

  // ── 9. Ông / bà: cha hoặc mẹ của người CHA / MẸ chủ hộ ───────────────────
  for (const n of nut) {
    if (n.qh) continue;
    const con = nut.find(
      (x) => (x.p.cha === n.p.ten || x.p.me === n.p.ten) && (x.qh === 'CHA' || x.qh === 'MẸ'),
    );
    if (con) gan(n, n.p.nam ? 'ÔNG' : 'BÀ', TRUC_HE, -2);
  }

  const ra = new Map();
  for (const n of nut) if (n.qh) ra.set(n.p.cccd, n.qh);
  return ra;

  function gan(n, qh, duong, doi) {
    n.qh = qh;
    n.duong = duong;
    n.doi = doi;
  }
}

/**
 * Tìm nút chủ hộ: ưu tiên CCCD, sau đó tới tên.
 *
 * Chủ hộ có thể KHÔNG có mặt trong danh sách nhân khẩu của hộ — đã mất hoặc
 * chuyển đi mà hộ chưa đổi chủ. Khi đó dựng một nút ảo chỉ có tên: đủ để suy ra
 * con và vợ/chồng của người đó, còn các luật cần ngày sinh hay tên cha mẹ của
 * chủ hộ thì tự động không khớp, nên không sinh ra suy diễn bừa.
 */
function timChuHo(nut, traTen, { cccd, ten } = {}) {
  const theoCccd = cccd ? nut.find((n) => n.p.cccd === cccd) : null;
  if (theoCccd) return theoCccd;
  if (!ten) return null;
  return traTen(ten) ?? { p: { cccd: '', ten, nam: null, moc: 0, cha: '', me: '' }, qh: '', duong: '', doi: 0 };
}

function laConCua(p, tenChuHo) {
  return p.cha === tenChuHo || p.me === tenChuHo;
}

/** Người con này có cha/mẹ là chủ hộ; trả về tên người còn lại trong cặp. */
function tenChaMeConLai(p, tenChuHo) {
  return p.cha === tenChuHo ? p.me : p.cha;
}

/**
 * Mọi cặp (cha, mẹ) của từng người trong hộ, cả hai chiều.
 *
 * Dùng để tìm bạn đời: nếu một bên đã có quan hệ mà bên kia chưa, thì bên kia
 * là vợ/chồng của bên đã biết — căn cứ là hai người có con chung.
 */
function capChaMe(nut, traTen) {
  const ra = [];
  for (const n of nut) {
    const cha = traTen(n.p.cha);
    const me = traTen(n.p.me);
    if (!cha || !me || cha === me) continue;
    ra.push({ a: cha, b: me }, { a: me, b: cha });
  }
  return ra;
}

/** Anh / chị nếu sinh trước chủ hộ, em nếu sinh sau. */
function thuBac(p, chuHo) {
  if (!p.moc || !chuHo.moc) return 'EM';
  if (p.moc >= chuHo.moc) return 'EM';
  return p.nam ? 'ANH' : 'CHỊ';
}
