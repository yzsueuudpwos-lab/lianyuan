/* 蓮緣素食・年菜預購目錄（2026-11-09 預覽）
   這份檔只處理目錄、檢查與這台瀏覽器的暫存。
   不呼叫 Apps Script、不寫 Google 試算表、不傳 LINE、不列印。
   全店同步要等 gas/20261109-yearmeal-append.gs 另行核准後才接得上；現在沒有接。 */
(function (root) {
  var STORAGE_KEY = 'ly_ym_catalog_v1';
  var ORDER_KEY = 'ly_ym_orders_v1';
  var VEG_NOTE = '本店是素食。佛跳牆、鮑魚、排翅、獅子頭、扣肉、鰻、鵝、雞、腰花等是素料的傳統叫法，不是真的肉或海鮮。';

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function intOrNull(v) {
    if (typeof v === 'number' && isFinite(v) && Math.floor(v) === v) return v;
    if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
    return null;
  }

  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function isTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

  function safePhoto(u) {
    u = String(u || '');
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(u)) return '';
    if (u.length < 80 || u.length > 180000) return '';
    return u;
  }

  function item(o) {
    return {
      id: o.id,
      histNo: o.histNo,
      historicalName: o.name,
      name: o.name,
      historicalPrice: o.price == null ? null : o.price,
      price: o.price == null ? null : o.price,
      priceConfirmed: false,
      historicalUnit: o.unit || '',
      unit: o.unit || '',
      historicalContents: o.contents || '',
      contents: o.contents || '',
      note: '',
      photo: '',
      on: true,
      variants: (o.variants || []).map(function (v) {
        return {
          id: v.id,
          historicalName: v.name,
          name: v.name,
          historicalPrice: v.price,
          price: v.price,
          priceConfirmed: false,
          on: true
        };
      })
    };
  }

  /* 2024 年 Facebook 貼文紙本菜單。份量只在原文有寫時才填。沒有截止日、取餐日、訂金、數量上限。 */
  var SEED_ITEMS = [
    item({ id: 'ym01', histNo: 1, name: '佛跳牆', price: 800 }),
    item({ id: 'ym02', histNo: 2, name: '鮑魚排翅', price: 500 }),
    item({ id: 'ym03', histNo: 3, name: '紅燒獅子頭', price: 500 }),
    item({ id: 'ym04', histNo: 4, name: '梅干扣肉', price: 500 }),
    item({ id: 'ym05', histNo: 5, name: '年年有餘', price: 500 }),
    item({ id: 'ym06', histNo: 6, name: '百果猴菇', price: 500 }),
    item({ id: 'ym07', histNo: 7, name: '栗子腰花', price: 500 }),
    item({ id: 'ym08', histNo: 8, name: '六星轉盤', price: 500, contents: '黑豆、烤鰻、蓮藕、煙燻素鵝、香菇素雞、水晶脆藻' }),
    item({ id: 'ym09', histNo: 9, name: '髮菜豆腦', price: 500 }),
    item({ id: 'ym10', histNo: 10, name: '客家年糕', price: null, unit: '斤', variants: [
      { id: 'ym10a', name: '紅豆', price: 150 },
      { id: 'ym10b', name: '原味', price: 135 }
    ] }),
    item({ id: 'ym11', histNo: 11, name: '港式蘿蔔糕', price: 150 }),
    item({ id: 'ym12', histNo: 12, name: '煙燻素鵝', price: 350, unit: '條' }),
    item({ id: 'ym13', histNo: 13, name: '油飯', price: 120, unit: '斤' })
  ];

  function blankSeason() {
    return {
      open: false,
      pickupDates: [],
      deadlineDate: '',
      deadlineTime: '',
      deposit: 'unset',
      depositNote: '',
      customerNote: '',
      pickupNote: ''
    };
  }

  function normalizeVariant(v) {
    v = v || {};
    return {
      id: String(v.id || '').trim(),
      historicalName: String(v.historicalName || '').trim(),
      name: String(v.name || '').trim(),
      historicalPrice: intOrNull(v.historicalPrice),
      price: intOrNull(v.price),
      priceConfirmed: !!v.priceConfirmed,
      on: v.on !== false
    };
  }

  function normalizeItem(x) {
    x = x || {};
    var photo = safePhoto(x.photo);
    return {
      id: String(x.id || '').trim(),
      histNo: x.histNo == null || x.histNo === '' ? null : intOrNull(x.histNo),
      historicalName: String(x.historicalName || '').trim(),
      name: String(x.name || '').trim(),
      historicalPrice: x.historicalPrice == null || x.historicalPrice === '' ? null : intOrNull(x.historicalPrice),
      price: x.price == null || x.price === '' ? null : intOrNull(x.price),
      priceConfirmed: !!x.priceConfirmed,
      historicalUnit: String(x.historicalUnit || '').trim(),
      unit: String(x.unit || '').trim(),
      historicalContents: String(x.historicalContents || '').trim(),
      contents: String(x.contents || '').trim(),
      note: String(x.note || '').trim(),
      photo: photo,
      on: x.on !== false,
      variants: Array.isArray(x.variants) ? x.variants.map(normalizeVariant) : []
    };
  }

  function normalize(input) {
    var src = input && typeof input === 'object' ? input : {};
    var seasonIn = src.season && typeof src.season === 'object' ? src.season : {};
    var deposit = seasonIn.deposit === 'none' || seasonIn.deposit === 'custom' ? seasonIn.deposit : 'unset';
    var dates = Array.isArray(seasonIn.pickupDates) ? seasonIn.pickupDates.map(function (x) { return String(x || '').trim(); }).filter(Boolean) : [];
    return {
      v: 1,
      scope: src.scope === 'device-local-preview' ? 'device-local-preview' : 'historical-seed',
      savedAt: typeof src.savedAt === 'string' ? src.savedAt : '',
      exampleDemo: !!src.exampleDemo,
      provenance: {
        source: '2024 年 Facebook 貼文紙本菜單',
        verifiedCurrentSeason: false,
        seededOn: '2026-11-09',
        note: '歷史參考，不是經本季確認的菜單'
      },
      season: {
        open: !!seasonIn.open,
        pickupDates: dates,
        deadlineDate: String(seasonIn.deadlineDate || '').trim(),
        deadlineTime: String(seasonIn.deadlineTime || '').trim(),
        deposit: deposit,
        depositNote: String(seasonIn.depositNote || '').trim(),
        customerNote: String(seasonIn.customerNote || '').trim(),
        pickupNote: String(seasonIn.pickupNote || '').trim()
      },
      items: Array.isArray(src.items) ? src.items.map(normalizeItem) : []
    };
  }

  function seedState() {
    var s = normalize({ items: clone(SEED_ITEMS), season: blankSeason(), scope: 'historical-seed' });
    s.savedAt = '';
    s.exampleDemo = false;
    return s;
  }

  function storageOf(storage) {
    if (storage) return storage;
    if (typeof localStorage !== 'undefined') return localStorage;
    throw new Error('no-storage');
  }

  function validateItem(it, items) {
    var errors = [];
    if (!it || typeof it !== 'object') return ['餐點資料不完整'];
    if (!/^ym[A-Za-z0-9_-]{1,40}$/.test(it.id || '')) errors.push('餐點編號不正確');
    if (!it.name) errors.push('請填品名');
    if (it.name && it.name.length > 30) errors.push('品名請在 30 字以內');
    if (items && items.some(function (other) { return other !== it && other.name && other.name === it.name; })) errors.push('已經有「' + it.name + '」了');
    if (it.unit && it.unit.length > 8) errors.push('單位請在 8 字以內');
    if (it.contents && it.contents.length > 200) errors.push('內容說明太長');
    if (it.note && it.note.length > 200) errors.push('備註太長');
    if (it.variants && it.variants.length) {
      var seen = {};
      it.variants.forEach(function (v, idx) {
        var label = '規格' + (idx + 1);
        if (!v.name) errors.push(label + '要填名稱');
        else if (v.name.length > 20) errors.push(label + '名稱太長');
        else if (seen[v.name]) errors.push('規格「' + v.name + '」重複');
        else seen[v.name] = 1;
        if (!(v.price > 0 && v.price < 10000)) errors.push((v.name || label) + '的價錢要是 1～9999 的整數');
        if (!/^ym[A-Za-z0-9_-]{1,40}$/.test(v.id || '')) errors.push(label + '編號不正確');
      });
    } else if (!(it.price > 0 && it.price < 10000)) {
      errors.push('價錢要是 1～9999 的整數');
    }
    return errors;
  }

  function validateState(state) {
    var errors = [], warnings = [];
    var s = state && state.season ? state.season : blankSeason();
    var items = state && Array.isArray(state.items) ? state.items : [];
    if (s.open && !s.pickupDates.length) errors.push('要開放預購，請先新增至少一個取餐日');
    var seenDate = {};
    s.pickupDates.forEach(function (d) {
      if (!isDate(d)) errors.push('取餐日「' + d + '」不是完整日期');
      else if (seenDate[d]) errors.push('取餐日「' + d + '」重複');
      seenDate[d] = 1;
    });
    if (s.deadlineDate && !isDate(s.deadlineDate)) errors.push('截止日要是完整日期，或先留空');
    if (s.deadlineTime && !s.deadlineDate) errors.push('有填截止時間的話，請先選截止日');
    if (s.deadlineTime && !isTime(s.deadlineTime)) errors.push('截止時間格式要像 15:00');
    if (s.deposit === 'custom' && !s.depositNote) errors.push('選了自訂訂金說明，請寫上內容；還沒決定就改回「尚未設定」');
    if (s.depositNote && s.depositNote.length > 200) errors.push('訂金說明太長');
    if (s.customerNote && s.customerNote.length > 300) errors.push('給客人的話太長');
    if (s.pickupNote && s.pickupNote.length > 200) errors.push('取餐說明太長');
    [s.customerNote, s.pickupNote, s.depositNote].forEach(function (txt) {
      if (txt && txt.indexOf('二月八') >= 0) errors.push('說明裡有「二月八」。2024 舊菜單的「二月八日前」不要當成本季截止；若本季真的要定那天，請用截止日欄選完整日期。');
    });
    if (s.deadlineDate && /-02-08$/.test(s.deadlineDate)) warnings.push('你選的是 2 月 8 日。2024 舊菜單寫過二月八日前，請確認這是本季自己定的，不是沿用舊句。');
    var ids = {};
    items.forEach(function (it) {
      if (it.id && ids[it.id]) errors.push('餐點編號重複');
      ids[it.id] = 1;
      validateItem(it, items).forEach(function (e) { errors.push(e); });
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function load(storage) {
    var st = storageOf(storage);
    var raw = null;
    try { raw = st.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) return { state: seedState(), source: 'seed' };
    try {
      var state = normalize(JSON.parse(raw));
      return { state: state, source: state.scope === 'device-local-preview' ? 'device' : 'seed' };
    } catch (e) {
      return { state: seedState(), source: 'seed', error: 'bad-json' };
    }
  }

  function save(state, storage) {
    var st = storageOf(storage);
    var prev = null;
    try { prev = st.getItem(STORAGE_KEY); } catch (e) { return { ok: false, errors: ['這台瀏覽器讀不到原本的紀錄'], warnings: [] }; }
    var next = normalize(state);
    next.scope = 'device-local-preview';
    next.provenance.verifiedCurrentSeason = false;
    next.savedAt = new Date().toISOString();
    var check = validateState(next);
    if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings, state: next };
    var json = JSON.stringify(next);
    try { st.setItem(STORAGE_KEY, json); }
    catch (e) {
      return { ok: false, errors: ['這台瀏覽器存不下（空間不足）。畫面內容還在，沒有寫入。'], warnings: check.warnings, state: next };
    }
    var back = null;
    try { back = st.getItem(STORAGE_KEY); } catch (e2) { back = null; }
    if (back !== json) {
      try { if (prev == null) st.removeItem(STORAGE_KEY); else st.setItem(STORAGE_KEY, prev); } catch (e3) {}
      return { ok: false, errors: ['存檔後讀回來不一致，已盡量還原舊紀錄。'], warnings: check.warnings };
    }
    return { ok: true, errors: [], warnings: check.warnings, state: normalize(JSON.parse(json)) };
  }

  function clearCatalog(storage) {
    var st = storageOf(storage);
    st.removeItem(STORAGE_KEY);
    return { state: seedState(), source: 'seed' };
  }

  function applyExample(state) {
    var s = normalize(state);
    s.season.open = true;
    s.season.pickupDates = ['2027-01-15'];
    s.season.deadlineDate = '';
    s.season.deadlineTime = '';
    s.season.deposit = 'unset';
    s.season.depositNote = '';
    s.season.pickupNote = '範例取餐日，不是本季公告';
    s.season.customerNote = '範例預覽，尚未正式開放';
    s.exampleDemo = true;
    return s;
  }

  function priceLabel(row, scope) {
    var money = (typeof row.price === 'number' && row.price > 0) ? ('$' + row.price) : '價錢未設定';
    if (!row.priceConfirmed) {
      return { kind: 'historical', short: money, text: money + '・2024 參考價（未經本季確認）' };
    }
    if (scope === 'device-local-preview') {
      return { kind: 'device', short: money, text: money + '・這台裝置改過（尚未同步全店，也不代表整季已核對）' };
    }
    return { kind: 'unsaved', short: money, text: money + '・這台畫面已改，還沒按儲存' };
  }

  function unitLabel(it) {
    if (!it.unit) return '份量未設定（舊菜單沒寫，預覽不代猜）';
    if (it.historicalUnit && it.unit === it.historicalUnit) return '單位：' + it.unit + '（舊菜單有標）';
    return '單位：' + it.unit + '（店家在這台裝置填的）';
  }

  function depositLabel(season) {
    if (!season || season.deposit === 'unset' || !season.deposit) return '尚未設定';
    if (season.deposit === 'none') return '店家在這份設定選了不收訂金';
    return season.depositNote || '店家自訂（說明還是空的）';
  }

  function deadlineLabel(season) {
    if (!season || !season.deadlineDate) return '尚未設定';
    return season.deadlineDate + (season.deadlineTime ? (' ' + season.deadlineTime) : '');
  }

  function seasonGate(state) {
    var s = state && state.season ? state.season : blankSeason();
    if (!s.open) return { ok: false, code: 'closed', message: '店家尚未開放年菜預購' };
    if (!s.pickupDates.length) return { ok: false, code: 'no-date', message: '尚未設定取餐日，不能送出' };
    return { ok: true };
  }

  function parseQty(v) {
    var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    if (!d) return 0;
    var n = parseInt(d, 10);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(999, n);
  }

  function makeId() {
    var s = '';
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (var i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'YMDEMO' + s;
  }

  function buildOrder(state, draft) {
    draft = draft || {};
    var st = normalize(state);
    var errors = [];
    var gate = seasonGate(st);
    if (!gate.ok) errors.push(gate.message);
    var name = String(draft.name || '').trim();
    var phone = String(draft.phone || '').trim();
    var note = String(draft.note || '').trim();
    var pickupDate = String(draft.pickupDate || '').trim();
    if (!name) errors.push('請填姓名');
    if (name.length > 30) errors.push('姓名請在 30 字以內');
    if (!phone) errors.push('請填電話');
    if (phone.length > 20) errors.push('電話請在 20 字以內');
    if (note.length > 200) errors.push('備註請在 200 字以內');
    if (st.season.open && st.season.pickupDates.length) {
      if (!pickupDate) errors.push('請選取餐日');
      else if (st.season.pickupDates.indexOf(pickupDate) < 0) errors.push('這個取餐日不在店家設定的清單');
    }
    var lines = [];
    var raw = Array.isArray(draft.lines) ? draft.lines : [];
    raw.forEach(function (ln) {
      var qty = parseQty(ln && ln.qty);
      if (!qty) return;
      var it = null;
      st.items.some(function (x) { if (x.id === (ln && ln.itemId)) { it = x; return true; } return false; });
      if (!it || !it.on) { errors.push('有餐點已下架或不在目錄'); return; }
      var variant = null, unitPrice, label, confirmed, histPrice;
      if (it.variants.length) {
        it.variants.some(function (v) { if (v.id === ln.variantId) { variant = v; return true; } return false; });
        if (!variant || !variant.on) { errors.push('請選還在上架的規格'); return; }
        unitPrice = variant.price;
        label = it.name + '（' + variant.name + '）';
        confirmed = variant.priceConfirmed;
        histPrice = variant.historicalPrice;
      } else {
        unitPrice = it.price;
        label = it.name;
        confirmed = it.priceConfirmed;
        histPrice = it.historicalPrice;
      }
      if (!(unitPrice > 0)) { errors.push(label + ' 價錢未設定'); return; }
      lines.push({
        itemId: it.id,
        variantId: variant ? variant.id : '',
        name: label,
        unit: it.unit || '',
        unitUnset: !it.unit,
        qty: qty,
        unitPrice: unitPrice,
        lineTotal: unitPrice * qty,
        priceConfirmed: !!confirmed,
        historicalPrice: histPrice == null ? null : histPrice
      });
    });
    if (!lines.length) errors.push('請先選年菜數量');
    if (errors.length) return { ok: false, errors: errors, draft: draft };
    var total = lines.reduce(function (sum, ln) { return sum + ln.lineTotal; }, 0);
    return {
      ok: true,
      errors: [],
      draft: draft,
      order: {
        demo: true,
        scope: 'device-local-preview',
        id: makeId(),
        label: '範例',
        name: name,
        phone: phone,
        note: note,
        pickupDate: pickupDate,
        lines: lines,
        total: total,
        createdAt: new Date().toISOString(),
        seasonExample: !!st.exampleDemo,
        notSent: ['google-apps-script', 'google-sheet', 'line', 'printer', 'live-order-queue']
      }
    };
  }

  function loadOrders(storage) {
    var st = storageOf(storage);
    try {
      var arr = JSON.parse(st.getItem(ORDER_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function storeOrder(order, storage) {
    if (!order || order.demo !== true || order.scope !== 'device-local-preview') {
      return { ok: false, errors: ['拒絕儲存這張單'] };
    }
    var st = storageOf(storage);
    var arr = loadOrders(st);
    arr.push(order);
    arr = arr.slice(-20);
    try { st.setItem(ORDER_KEY, JSON.stringify(arr)); }
    catch (e) { return { ok: false, errors: ['這台瀏覽器存不下預覽單，畫面上的內容還在。'] }; }
    return { ok: true, orders: loadOrders(st) };
  }

  function clearOrders(storage) {
    storageOf(storage).removeItem(ORDER_KEY);
    return [];
  }

  function newItemDraft() {
    return normalizeItem({
      id: 'ymn' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
      histNo: null,
      historicalName: '',
      name: '',
      historicalPrice: null,
      price: null,
      priceConfirmed: false,
      historicalUnit: '',
      unit: '',
      historicalContents: '',
      contents: '',
      note: '',
      photo: '',
      on: true,
      variants: []
    });
  }

  root.YM = {
    STORAGE_KEY: STORAGE_KEY,
    ORDER_KEY: ORDER_KEY,
    VEG_NOTE: VEG_NOTE,
    clone: clone,
    esc: esc,
    seedState: seedState,
    normalize: normalize,
    load: load,
    save: save,
    clearCatalog: clearCatalog,
    applyExample: applyExample,
    validateState: validateState,
    validateItem: validateItem,
    priceLabel: priceLabel,
    unitLabel: unitLabel,
    depositLabel: depositLabel,
    deadlineLabel: deadlineLabel,
    seasonGate: seasonGate,
    parseQty: parseQty,
    buildOrder: buildOrder,
    storeOrder: storeOrder,
    loadOrders: loadOrders,
    clearOrders: clearOrders,
    safePhoto: safePhoto,
    isDate: isDate,
    newItemDraft: newItemDraft
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
