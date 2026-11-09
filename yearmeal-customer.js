/* 客人頁的年菜預購。跟便當購物車分開，不呼叫 GAS、不開 LINE、不寫「我的便當」。 */
(function () {
  if (!window.YM) return;
  var yq = {};
  var ymKey = '';
  var ymLoaded = null;
  var ymSending = false;

  function $(id) { return document.getElementById(id); }
  function yk(id, v) { return v ? (id + '@' + v) : id; }

  function current() {
    var loaded = YM.load();
    var key = JSON.stringify(loaded.state);
    if (key !== ymKey) {
      ymKey = key;
      ymLoaded = loaded;
      paint();
    }
    return ymLoaded;
  }

  function setStatus(kind, text) {
    var el = $('ymStatus');
    if (!el) return;
    el.className = kind || '';
    el.textContent = text || '';
  }

  function selectedCount() {
    var n = 0;
    Object.keys(yq).forEach(function (k) { n += yq[k] || 0; });
    return n;
  }

  function syncQtyInputs() {
    document.querySelectorAll('[data-ymqty]').forEach(function (el) {
      var k = yk(el.getAttribute('data-id'), el.getAttribute('data-var') || '');
      if (document.activeElement !== el) el.value = String(yq[k] || 0);
    });
    var n = selectedCount();
    var bar = $('ybar');
    if (bar) {
      bar.classList.toggle('show', n > 0);
      var label = $('ybarN');
      if (label) label.textContent = '年菜已選 ' + n + ' 項（跟便當分開）';
    }
    var submitBtn = $('ymSubmit');
    if (submitBtn && n > 0 && submitBtn.textContent === '已留在這台裝置') {
      submitBtn.disabled = false;
      submitBtn.textContent = '把這張預覽單留在這台裝置';
    }
    if (sheetOpen()) paintLines();
  }

  function setQty(id, variant, raw, fin) {
    var k = yk(id, variant);
    var n = YM.parseQty(raw);
    yq[k] = n;
    document.querySelectorAll('[data-ymqty]').forEach(function (el) {
      if (el.getAttribute('data-id') === id && (el.getAttribute('data-var') || '') === (variant || '')) {
        if (fin || document.activeElement !== el) el.value = String(n);
      }
    });
    syncQtyInputs();
  }

  function sheetOpen() {
    var el = $('ysheet');
    return !!(el && el.style.display === 'block');
  }

  function fillDates(state) {
    var sel = $('ymDate');
    if (!sel) return;
    var cur = sel.value;
    var dates = state.season.pickupDates || [];
    if (!dates.length) {
      sel.innerHTML = '<option value="">尚未設定取餐日</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    var demo = state.exampleDemo ? '（範例，不是本季公告）' : '';
    sel.innerHTML = '<option value="">請選取餐日</option>' + dates.map(function (d) {
      return '<option value="' + YM.esc(d) + '">' + YM.esc(d + demo) + '</option>';
    }).join('');
    if (dates.indexOf(cur) >= 0) sel.value = cur;
  }

  function paintLines() {
    var box = $('ymLines');
    var loaded = ymLoaded || YM.load();
    var state = loaded.state;
    if (!box) return;
    var rows = [];
    state.items.forEach(function (it) {
      if (!it.on) return;
      if (it.variants.length) {
        it.variants.forEach(function (v) {
          if (!v.on) return;
          var q = yq[yk(it.id, v.id)] || 0;
          if (!q) return;
          var label = YM.priceLabel(v, state.scope);
          rows.push('<div class="ci2"><div class="n">' + YM.esc(it.name + '（' + v.name + '）') + '<small>' + YM.esc(label.text) + (it.unit ? '・' + YM.esc(it.unit) : '・份量未設定') + '</small></div><div class="qty"><button type="button" class="m" data-ymact="minus" data-id="' + YM.esc(it.id) + '" data-var="' + YM.esc(v.id) + '">−</button><input class="qin" data-ymqty="1" data-id="' + YM.esc(it.id) + '" data-var="' + YM.esc(v.id) + '" value="' + q + '" type="text" inputmode="numeric" maxlength="3" aria-label="' + YM.esc(it.name + v.name) + ' 數量"><button type="button" data-ymact="plus" data-id="' + YM.esc(it.id) + '" data-var="' + YM.esc(v.id) + '">＋</button></div><span class="st">$' + (v.price * q) + '</span></div>');
        });
      } else {
        var q2 = yq[yk(it.id, '')] || 0;
        if (!q2) return;
        var label2 = YM.priceLabel(it, state.scope);
        rows.push('<div class="ci2"><div class="n">' + YM.esc(it.name) + '<small>' + YM.esc(label2.text) + '・' + YM.esc(YM.unitLabel(it)) + '</small></div><div class="qty"><button type="button" class="m" data-ymact="minus" data-id="' + YM.esc(it.id) + '" data-var="">−</button><input class="qin" data-ymqty="1" data-id="' + YM.esc(it.id) + '" data-var="" value="' + q2 + '" type="text" inputmode="numeric" maxlength="3" aria-label="' + YM.esc(it.name) + ' 數量"><button type="button" data-ymact="plus" data-id="' + YM.esc(it.id) + '" data-var="">＋</button></div><span class="st">$' + ((it.price || 0) * q2) + '</span></div>');
      }
    });
    var total = orderTotal(state);
    box.innerHTML = (rows.join('') || '<p class="note">還沒選年菜。</p>') + '<div class="ctot">年菜合計 $' + total + '（共 ' + selectedCount() + '）</div>';
    var season = $('ymSeasonBox');
    if (season) {
      var dates = state.season.pickupDates.length ? state.season.pickupDates.join('、') : '尚未設定';
      season.textContent = (state.exampleDemo ? '【範例】取餐日是預覽假資料，不是店家公告。' : '') +
        (state.season.open ? '預購：這份設定是開的。' : '預購：尚未開放。') +
        ' 可選取餐日：' + dates +
        '。截止：' + YM.deadlineLabel(state.season) +
        '。訂金：' + YM.depositLabel(state.season) +
        (state.season.pickupNote ? '。' + state.season.pickupNote : '') +
        (state.season.customerNote ? '。' + state.season.customerNote : '');
    }
  }

  function orderTotal(state) {
    var total = 0;
    state.items.forEach(function (it) {
      if (!it.on) return;
      if (it.variants.length) {
        it.variants.forEach(function (v) {
          var q = yq[yk(it.id, v.id)] || 0;
          if (v.on && q && v.price > 0) total += v.price * q;
        });
      } else {
        var q2 = yq[yk(it.id, '')] || 0;
        if (q2 && it.price > 0) total += it.price * q2;
      }
    });
    return total;
  }

  function cardQty(id, variant, name) {
    var q = yq[yk(id, variant)] || 0;
    return '<div class="qty"><button type="button" class="m" data-ymact="minus" data-id="' + YM.esc(id) + '" data-var="' + YM.esc(variant) + '" aria-label="減少">−</button><input class="qin" data-ymqty="1" data-id="' + YM.esc(id) + '" data-var="' + YM.esc(variant) + '" value="' + q + '" type="text" inputmode="numeric" maxlength="3" aria-label="' + YM.esc(name) + ' 數量"><button type="button" data-ymact="plus" data-id="' + YM.esc(id) + '" data-var="' + YM.esc(variant) + '" aria-label="增加">＋</button></div>';
  }

  function paint() {
    var root = $('ymRoot');
    if (!root || !ymLoaded) return;
    var state = ymLoaded.state;
    var src = ymLoaded.source;
    var head = '<div class="ym-prov" id="ymProv"><b>2024 年舊菜單參考</b><br>來源是當年 Facebook 貼文的紙本清單，<b>不是已經核對過的本季菜單</b>。價錢先沿用當時數字，標成參考價。舊文裡的截止日沒有帶進來。</div>';
    if (src === 'device') {
      head += '<div class="ym-scope">這台裝置有店家預覽修改（' + YM.esc(state.savedAt ? state.savedAt.replace('T', ' ').slice(0, 16) : '') + '）。只存在這台瀏覽器，其他手機看不到，也還沒寫入店家後台。</div>';
    } else if (ymLoaded.error === 'bad-json') {
      head += '<div class="ym-scope">這台裝置的年菜紀錄讀不了，先顯示 2024 參考目錄，還沒覆寫那筆壞掉的紀錄。</div>';
    } else {
      head += '<div class="ym-scope">店家還沒在這台裝置按過儲存。下面是程式內建的 2024 參考，不是全店同步。</div>';
    }
    if (state.exampleDemo) head += '<div class="ym-scope"><span class="ym-demo">範例</span>取餐日是預覽用的假日期，不是本季公告。</div>';
    head += '<p class="note">' + YM.esc(YM.VEG_NOTE) + '</p>';
    head += '<p class="note">沒有逐張舊照片可對上菜名，所以不猜哪張是哪道。有照片才表示店家自己放的。</p>';
    var gate = YM.seasonGate(state);
    head += '<div class="info" style="margin-bottom:12px">預購：' + (state.season.open ? '這份設定為開放' : '<b>尚未開放</b>') +
      '<br>取餐日：' + YM.esc(state.season.pickupDates.length ? state.season.pickupDates.join('、') : '尚未設定') +
      '<br>截止：' + YM.esc(YM.deadlineLabel(state.season)) +
      '<br>訂金：' + YM.esc(YM.depositLabel(state.season)) +
      (gate.ok ? '' : '<br><b>' + YM.esc(gate.message) + '</b>，仍可先看品項與價錢。') + '</div>';
    if (window.YM_HELD_N) head += '<p class="note">線上便當菜單裡有 ' + Number(window.YM_HELD_N) + ' 筆被標成年菜，已從今日便當拿掉，避免變成今天的單。不會自動併進這份目錄。</p>';
    var html = head;
    state.items.forEach(function (it) {
      if (!it.on) return;
      var photo = it.photo ? '<img alt="' + YM.esc(it.historicalName || it.name) + '（店家上傳）" src="' + YM.esc(it.photo) + '" style="width:100%;height:160px;object-fit:cover;border-radius:12px;margin-bottom:8px">' : '<div class="ympic">尚無已核對照片</div>';
      var hist = it.histNo ? '<span class="ymtag">2024 舊單 ' + YM.esc(String(it.histNo)) + '</span>' : '<span class="ymtag">店家另加</span>';
      if (it.historicalName && it.historicalName !== it.name) hist += '<span class="ymtag">舊名 ' + YM.esc(it.historicalName) + '</span>';
      var body = photo + '<h3>' + YM.esc(it.name) + '</h3><div>' + hist + '</div>';
      body += '<p class="note" style="margin-top:6px">' + YM.esc(YM.unitLabel(it)) + '</p>';
      if (it.contents) body += '<p class="note">內容：' + YM.esc(it.contents) + (it.historicalContents && it.historicalContents !== it.contents ? '（舊菜單原文：' + YM.esc(it.historicalContents) + '）' : '') + '</p>';
      if (it.variants.length) {
        body += it.variants.filter(function (v) { return v.on; }).map(function (v) {
          var label = YM.priceLabel(v, state.scope);
          var old = v.historicalName && v.historicalName !== v.name ? '<span class="ymtag">舊名 ' + YM.esc(v.historicalName) + '</span>' : '';
          return '<div class="ymsub"><div><b>' + YM.esc(v.name) + '</b> ' + old + '<div class="ymprice">' + YM.esc(label.text) + '</div></div>' + cardQty(it.id, v.id, it.name + v.name) + '</div>';
        }).join('');
      } else {
        var label2 = YM.priceLabel(it, state.scope);
        body += '<div class="row"><span class="ymprice">' + YM.esc(label2.text) + '</span>' + cardQty(it.id, '', it.name) + '</div>';
      }
      html += '<article class="ymcard" data-ym-item="' + YM.esc(it.id) + '">' + body + '</article>';
    });
    if (!state.items.some(function (it) { return it.on; })) html += '<p class="note">目前沒有上架的年菜。</p>';
    root.innerHTML = html;
    fillDates(state);
    syncQtyInputs();
  }

  function openSheet() {
    current();
    fillDates((ymLoaded || YM.load()).state);
    paintLines();
    setStatus('', '');
    var sh = $('ysheet');
    if (!sh) return;
    if (!sheetOpen()) {
      sh.style.display = 'block';
      var inner = sh.querySelector('.in');
      if (inner) inner.scrollTop = 0;
      if (!(history.state && history.state.ymcart)) history.pushState({ ymcart: 1 }, '');
    }
  }

  function closeSheet(fromPop) {
    var sh = $('ysheet');
    if (sh) sh.style.display = 'none';
    if (!fromPop && history.state && history.state.ymcart) history.back();
  }

  function draftFromForm() {
    var lines = [];
    Object.keys(yq).forEach(function (k) {
      if (!yq[k]) return;
      var p = k.split('@');
      lines.push({ itemId: p[0], variantId: p[1] || '', qty: yq[k] });
    });
    return {
      name: $('ymNm') ? $('ymNm').value : '',
      phone: $('ymPh') ? $('ymPh').value : '',
      note: $('ymNt') ? $('ymNt').value : '',
      pickupDate: $('ymDate') ? $('ymDate').value : '',
      lines: lines
    };
  }

  function submitOrder() {
    if (ymSending) return;
    if (!selectedCount() && $('ymStatus') && $('ymStatus').className === 'ok') return;
    var btn = $('ymSubmit');
    ymSending = true;
    if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; btn.setAttribute('aria-busy', 'true'); }
    setStatus('load', '儲存中…請稍候，不要連按。');
    var draft = draftFromForm();
    var ok = false;
    try {
      var loaded = YM.load();
      ymLoaded = loaded;
      ymKey = JSON.stringify(loaded.state);
      var built = YM.buildOrder(loaded.state, draft);
      if (!built.ok) {
        setStatus('bad', built.errors.join('\n'));
        return;
      }
      var stored = YM.storeOrder(built.order, localStorage);
      if (!stored.ok) {
        setStatus('bad', stored.errors.join('\n'));
        return;
      }
      ok = true;
      yq = {};
      syncQtyInputs();
      paint();
      var lines = built.order.lines.map(function (ln) {
        return ln.name + ' × ' + ln.qty + ' = $' + ln.lineTotal + (ln.priceConfirmed ? '' : '（2024 參考價）');
      }).join('\n');
      setStatus('ok', '【範例】已留在這台裝置\n編號 ' + built.order.id + '\n' + lines + '\n合計 $' + built.order.total + '\n取餐日 ' + built.order.pickupDate + '\n\n沒有送到店家、沒有寫入訂單表、沒有傳 LINE、沒有列印，也不會出現在今天的接單清單。');
    } catch (e) {
      setStatus('bad', '沒有存成：' + (e && e.message ? e.message : e));
    } finally {
      ymSending = false;
      if (btn) {
        btn.removeAttribute('aria-busy');
        if (ok) { btn.disabled = true; btn.textContent = '已留在這台裝置'; }
        else { btn.disabled = false; btn.textContent = '把這張預覽單留在這台裝置'; }
      }
      if (!ok) {
        /* 失敗時保留姓名、電話、備註、數量 */
        if ($('ymNm')) $('ymNm').value = draft.name;
        if ($('ymPh')) $('ymPh').value = draft.phone;
        if ($('ymNt')) $('ymNt').value = draft.note;
      }
    }
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ymact], #ymOpenSheetBtn, #ybarGo');
    if (!t) return;
    if (t.id === 'ymOpenSheetBtn' || t.id === 'ybarGo') { openSheet(); return; }
    var act = t.getAttribute('data-ymact');
    if (act === 'plus' || act === 'minus') {
      var id = t.getAttribute('data-id');
      var v = t.getAttribute('data-var') || '';
      var k = yk(id, v);
      yq[k] = Math.min(999, Math.max(0, (yq[k] || 0) + (act === 'plus' ? 1 : -1)));
      syncQtyInputs();
    }
  });
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-ymqty')) return;
    var d = String(el.value).replace(/[^0-9]/g, '').slice(0, 3);
    if (el.value !== d) el.value = d;
    yq[yk(el.getAttribute('data-id'), el.getAttribute('data-var') || '')] = YM.parseQty(d);
    var n = selectedCount();
    var bar = $('ybar');
    if (bar) bar.classList.toggle('show', n > 0);
    var label = $('ybarN');
    if (label) label.textContent = '年菜已選 ' + n + ' 項（跟便當分開）';
    if (sheetOpen()) {
      var tot = $('ymLines') && $('ymLines').querySelector('.ctot');
      if (tot) tot.textContent = '年菜合計 $' + orderTotal((ymLoaded || YM.load()).state) + '（共 ' + n + '）';
    }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-ymqty')) return;
    setQty(el.getAttribute('data-id'), el.getAttribute('data-var') || '', el.value, true);
  });
  var submit = $('ymSubmit');
  if (submit) submit.addEventListener('click', submitOrder);
  var closeBtn = $('ymClose');
  if (closeBtn) closeBtn.addEventListener('click', function () { closeSheet(false); });
  var sheet = $('ysheet');
  if (sheet) sheet.addEventListener('click', function (ev) { if (ev.target === sheet) closeSheet(false); });
  window.addEventListener('popstate', function () { if (sheetOpen()) closeSheet(true); });
  window.addEventListener('storage', function (ev) {
    if (!ev || (ev.key !== YM.STORAGE_KEY && ev.key !== YM.ORDER_KEY)) return;
    ymKey = '';
    current();
  });

  window.ymOnMenuRender = function () { current(); };
  window.ymSheetOpen = sheetOpen;
  ymLoaded = YM.load();
  ymKey = JSON.stringify(ymLoaded.state);
  paint();
})();
