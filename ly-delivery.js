/* 20261114 蓮緣便當外送費預估（Lalamove）
   - 客人填地址 → 呼叫後端 GAS action=lalamoveQuote（金鑰只在 Apps Script 指令碼屬性，網頁沒有任何金鑰）
   - 估不到（後端還沒接上、地址找不到、Lalamove 沒回）→ 顯示「暫時無法估算，店家會用電話告知外送費」，訂單照樣可以送出
   - 外送資訊同時寫進送給後端的備註（【外送】開頭），舊版後端也看得到地址
*/
(function (w) {
  'use strict';

  var LY_PICKUP_ADDR = '台北市大安區光復南路410號';
  var LY_FAIL_MSG = '暫時無法估算，店家會用電話告知外送費';
  var LY_REAL_NOTE = '實際以 Lalamove 叫車金額為準，多退少補';
  var LY_METHOD = 'pickup'; // pickup | delivery
  var LY_QUOTE = null;      // {fee, quotationId, addrKey, distanceKm}
  var LY_FAIL = null;       // {addrKey, why}
  var LY_LOADING = false;
  var quoteTimer = 0, quoteSeq = 0;

  w.LY_PICKUP_ADDR = LY_PICKUP_ADDR;

  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function h(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function addrDisp(addr, floor) {
    addr = String(addr || '').trim(); floor = String(floor || '').trim();
    if (!addr) return floor;
    if (!floor) return addr;
    return addr + '，' + floor;
  }
  function isDelivery() { return LY_METHOD === 'delivery'; }
  function addrKey(addr, floor) {
    return String(addr || '').trim().replace(/\s+/g, '') + '|' + String(floor || '').trim();
  }
  function curKey() { return addrKey(val('dlAddr'), val('dlFloor')); }
  function quoteValid() {
    return isDelivery() && !!LY_QUOTE && LY_QUOTE.addrKey === curKey() && isFinite(+LY_QUOTE.fee);
  }
  function quoteFailed() { return isDelivery() && !!LY_FAIL && LY_FAIL.addrKey === curKey(); }
  function fee() { return quoteValid() ? +LY_QUOTE.fee : 0; }
  function sub() { return typeof tot === 'function' ? tot() : 0; }
  function grand() { return sub() + fee(); }
  function haptic(k) { if (typeof lyHaptic === 'function') { try { lyHaptic(k); } catch (e) {} } }

  function showFee(kind, html) {
    var box = $('dlFee');
    if (!box) return;
    box.className = kind || '';
    if (html) { box.innerHTML = html; box.classList.add('show'); }
    else { box.innerHTML = ''; box.classList.remove('show'); }
  }

  function feeRowHtml() {
    if (quoteValid()) return '<div class="r"><span>外送費預估</span><span>$' + fee() + '</span></div>';
    if (quoteFailed()) return '<div class="r"><span>外送費</span><span>店家電話告知</span></div>';
    return '<div class="r"><span>外送費預估</span><span>尚未查詢</span></div>';
  }
  function grandRowHtml() {
    if (quoteValid()) return '<div class="r grand"><span>預估總額</span><span>$' + grand() + '</span></div>';
    if (quoteFailed()) return '<div class="r grand"><span>便當 $' + sub() + '＋外送費</span><span>另計</span></div>';
    return '<div class="r grand"><span>預估總額</span><span>—</span></div>';
  }

  function lyFillTot() {
    var el = $('ctot');
    if (!el) return;
    var n = typeof cnt === 'function' ? cnt() : 0, s = sub();
    if (isDelivery()) {
      el.innerHTML = '<div class="tot-break">' +
        '<div class="r"><span>便當小計（共 ' + n + ' 份）</span><span>$' + s + '</span></div>' +
        feeRowHtml() + grandRowHtml() + '</div>';
    } else {
      el.textContent = '合計 $' + s + '（共 ' + n + ' 份）';
    }
    var items = $('items');
    if (items) {
      var t = (typeof lines === 'function' ? lines().join('\n') : '') + '\n便當小計：$' + s;
      if (quoteValid()) t += '\n外送費預估：$' + fee() + '\n預估總額：$' + grand();
      else if (quoteFailed()) t += '\n外送費：店家電話告知';
      else t += '\n合計：$' + s;
      items.textContent = t;
    }
  }

  function lyMethodLine() {
    if (!isDelivery()) return '現場自取（光復南路410號）';
    var a = val('dlAddr'), fl = val('dlFloor');
    return '外送（Lalamove）' + (a || fl ? '　' + addrDisp(a, fl) : '');
  }

  function lyDeliveryPayload() {
    var d = isDelivery();
    var o = {
      method: d ? 'delivery' : 'pickup',
      address: d ? val('dlAddr') : '',
      floor: d ? val('dlFloor') : '',
      subtotal: sub(),
      deliveryFee: d && quoteValid() ? fee() : 0,
      quotationId: d && quoteValid() && LY_QUOTE.quotationId ? LY_QUOTE.quotationId : ''
    };
    o.total = o.subtotal + o.deliveryFee;
    return o;
  }

  /* 送給後端的備註：外送資訊放最前面（舊版後端只存備註，店家接單頁才看得到地址） */
  function lyNoteForGas(note) {
    note = String(note || '').trim();
    if (!isDelivery()) return note;
    var parts = ['地址：' + addrDisp(val('dlAddr'), val('dlFloor'))];
    parts.push(quoteValid() ? '外送費預估 $' + fee() : '外送費：店家電話告知');
    var s = '【外送】' + parts.join('｜');
    if (note) s += '｜備註：' + note;
    return s;
  }

  function lyTxtExtra() {
    if (!isDelivery()) return '方式：現場自取';
    var parts = ['方式：外送（Lalamove）', '地址：' + val('dlAddr')];
    if (val('dlFloor')) parts.push('樓層／備註：' + val('dlFloor'));
    if (quoteValid()) {
      parts.push('外送費預估：$' + fee() + '（' + LY_REAL_NOTE + '）');
      parts.push('便當小計：$' + sub());
      parts.push('預估總額：$' + grand());
    } else {
      parts.push('外送費：請店家電話告知');
    }
    return parts.join('\n');
  }

  function paintFee() {
    if (!isDelivery()) { showFee('', ''); return; }
    if (LY_LOADING) { showFee('load', '正在估算外送費…'); return; }
    if (quoteValid()) {
      showFee('ok', '<span class="fee-amt">外送費預估 NT$' + fee() + '</span>' + LY_REAL_NOTE + '。' +
        (LY_QUOTE.distanceKm ? '<br>距離約 ' + LY_QUOTE.distanceKm + ' 公里。' : ''));
      return;
    }
    if (quoteFailed()) {
      showFee('bad', '<b>' + LY_FAIL_MSG + '</b>' + (LY_FAIL.why ? '<br>' + h(LY_FAIL.why) : '') + '<br>訂單一樣可以送出。');
      return;
    }
    showFee('', '');
  }

  function setMethod(m) {
    LY_METHOD = m === 'delivery' ? 'delivery' : 'pickup';
    var p = $('mPickup'), d = $('mDelivery'), box = $('dlBox');
    if (p) p.className = isDelivery() ? '' : 'on';
    if (d) d.className = isDelivery() ? 'on' : '';
    if (box) box.style.display = isDelivery() ? 'block' : 'none';
    var today = $('mToday');
    if (today) today.textContent = isDelivery() ? '🛵 今天外送' : '🏃 今天現場取';
    var lab = $('tmLabel');
    if (lab) lab.textContent = isDelivery() ? '希望送達時間' : '取餐時間';
    var hint = $('tmHint');
    if (hint && !isDelivery()) {
      hint.textContent = '上午 10:30–下午 1:50、下午 4:30–7:50，每 10 分鐘一個時段，下單後最快 10 分鐘可取；週日休息';
    } else if (hint) {
      hint.textContent = '請選希望送到的時段（上午 10:30–下午 1:50、下午 4:30–7:50）。店家會依這個時間叫 Lalamove，實際抵達可能略有出入。週日休息。';
    }
    paintFee();
    lyFillTot();
    if (isDelivery() && !quoteValid() && !quoteFailed() && val('dlAddr').length >= 8) scheduleQuote();
    if (typeof review === 'function') review();
  }

  function onAddrChanged() {
    if (LY_QUOTE && LY_QUOTE.addrKey !== curKey()) LY_QUOTE = null;
    if (LY_FAIL && LY_FAIL.addrKey !== curKey()) LY_FAIL = null;
    paintFee();
    lyFillTot();
  }

  async function lyRequestQuote() {
    if (!isDelivery()) return;
    clearTimeout(quoteTimer);
    var address = val('dlAddr'), floor = val('dlFloor'), key = addrKey(address, floor);
    if (address.length < 8) {
      showFee('bad', '請先填完整的外送地址，例如：台北市大安區信義路四段1號');
      haptic('error');
      return;
    }
    var seq = ++quoteSeq;
    var btn = $('dlQuoteBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 查詢中…'; }
    LY_LOADING = true; paintFee();
    var data = null;
    try {
      if (typeof GAS_URL === 'undefined' || !GAS_URL) throw new Error('no-backend');
      var ac = w.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ac) ac.abort(); }, 15000);
      try {
        var r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'lalamoveQuote', address: address, floor: floor }), signal: ac && ac.signal });
        data = await r.json();
      } finally { clearTimeout(tm); }
    } catch (err) { data = null; }
    if (seq !== quoteSeq) return; // 期間又改了地址，這次結果不用
    LY_LOADING = false;
    if (btn) { btn.disabled = false; btn.textContent = '查詢預估外送費'; }
    if (key !== curKey()) { onAddrChanged(); return; }
    if (data && data.ok && isFinite(+data.fee) && +data.fee > 0) {
      LY_QUOTE = { fee: Math.round(+data.fee), quotationId: data.quotationId || '', addrKey: key, distanceKm: data.distanceKm || '' };
      LY_FAIL = null;
      haptic('success');
    } else {
      LY_QUOTE = null;
      var why = '';
      if (data && data.error === 'geocode') why = '（找不到這個地址，可以再核對一次）';
      else if (data && data.error === 'address') why = '（地址好像不完整）';
      LY_FAIL = { addrKey: key, why: why };
      haptic('error');
    }
    paintFee();
    lyFillTot();
    if (typeof review === 'function') review();
  }

  function scheduleQuote() {
    onAddrChanged();
    if (!isDelivery()) return;
    clearTimeout(quoteTimer);
    if (val('dlAddr').length < 8) return;
    quoteTimer = setTimeout(function () { lyRequestQuote(); }, 900);
  }

  function lyOkDelivery() {
    if (!isDelivery()) return true;
    if (val('dlAddr').length < 8) {
      haptic('error');
      alert('請填完整的外送地址');
      var a = $('dlAddr'); if (a) a.focus();
      return false;
    }
    if (LY_LOADING) {
      haptic('error');
      alert('外送費還在估算，請等一下再送出');
      return false;
    }
    if (!quoteValid() && !quoteFailed()) {
      lyRequestQuote();
      alert('正在幫你估算外送費，估好後請再按一次送出');
      return false;
    }
    return true; // 估到了，或估不到（店家電話告知）都可以送
  }

  function lyReviewExtra() {
    if (!isDelivery()) return '🏪 自取：台北市大安區光復南路410號';
    var html = '🛵 外送（Lalamove）<br>📍 ' + (val('dlAddr') ? h(addrDisp(val('dlAddr'), val('dlFloor'))) : '<span style="color:#c0392b">（請填地址）</span>');
    if (quoteValid()) html += '<br><span class="fee-amt" style="font-size:20px">外送費預估 NT$' + fee() + '</span>' + LY_REAL_NOTE;
    else if (quoteFailed()) html += '<br><b>' + LY_FAIL_MSG + '</b>';
    else html += '<br><span style="color:#c0392b">尚未查詢預估外送費</span>';
    return html;
  }

  function lyReviewTotHtml() {
    var n = typeof cnt === 'function' ? cnt() : 0, s = sub();
    if (isDelivery()) {
      return '<div class="tot-break" style="margin:8px 0">' +
        '<div class="r"><span>便當小計（共 ' + n + ' 份）</span><span>$' + s + '</span></div>' +
        feeRowHtml() + grandRowHtml() + '</div>';
    }
    return '<div style="border-top:1px dashed #9c9;margin:6px 0;font-weight:700;font-size:18px">合計 $' + s + '（共 ' + n + ' 份）</div>';
  }

  w.isDelivery = isDelivery;
  w.lyFee = fee;
  w.lyGrand = grand;
  w.lyFillTot = lyFillTot;
  w.lyMethodLine = lyMethodLine;
  w.lyDeliveryPayload = lyDeliveryPayload;
  w.lyNoteForGas = lyNoteForGas;
  w.lyTxtExtra = lyTxtExtra;
  w.setMethod = setMethod;
  w.lyRequestQuote = lyRequestQuote;
  w.lyOkDelivery = lyOkDelivery;
  w.lyReviewExtra = lyReviewExtra;
  w.lyReviewTotHtml = lyReviewTotHtml;
  w.lyQuoteValid = quoteValid;
  w.lyQuoteFailed = quoteFailed;
  w.lyScheduleQuote = scheduleQuote;

  document.addEventListener('input', function (e) {
    if (!e.target) return;
    if (e.target.id === 'dlAddr' || e.target.id === 'dlFloor') {
      try { localStorage.setItem('ly_' + e.target.id, e.target.value); } catch (err) {}
      scheduleQuote();
    }
  });

  w.lyInitDeliveryFields = function () {
    ['dlAddr', 'dlFloor'].forEach(function (k) {
      var e = $(k); if (!e) return;
      try { if (!e.value) e.value = localStorage.getItem('ly_' + k) || ''; } catch (err) {}
    });
  };
})(window);
