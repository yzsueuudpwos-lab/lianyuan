/* 店員頁的年菜目錄。只寫這台瀏覽器。不呼叫菜單存檔、不上傳照片、不列印。 */
(function () {
  if (!window.YM) return;
  var $=function(id){return document.getElementById(id);};
  var first = YM.load();
  var ymState = first.state;
  var ymEditId = null;
  var ymDraft = null;
  var ymPhoto = '';
  var ymMode = 'single';
  var ymBusy = false;
  var ymFlash = null;
  var ymVarBuffer = null;

  function money(v) {
    var d = String(v == null ? '' : v).replace(/[^0-9]/g, '').slice(0, 4);
    if (!d) return null;
    var n = parseInt(d, 10);
    return n > 9999 ? 9999 : n;
  }

  function captureSeason() {
    var btn = $('ymOpenBtn');
    if (!btn) return;
    ymState.season.open = btn.getAttribute('data-on') === '1';
    ymState.season.deadlineDate = $('ymDeadline') ? $('ymDeadline').value : '';
    ymState.season.deadlineTime = $('ymDeadlineTime') ? $('ymDeadlineTime').value : '';
    ymState.season.deposit = $('ymDeposit') ? $('ymDeposit').value : 'unset';
    ymState.season.depositNote = $('ymDepositNote') ? $('ymDepositNote').value : '';
    ymState.season.pickupNote = $('ymPickupNote') ? $('ymPickupNote').value : '';
    ymState.season.customerNote = $('ymCustomerNote') ? $('ymCustomerNote').value : '';
  }
  window.ymCaptureSeason = captureSeason;

  function showMsg(kind, text) {
    var el = $('ymMsg');
    if (el) {
      el.className = kind === 'ok' ? 'ym-ok' : (kind === 'load' ? 'ym-scope' : 'ym-err');
      el.textContent = text || '';
    }
    var near = $('ymEName');
    if (near && kind === 'bad') {
      var hint = $('ymEditMsg');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'ymEditMsg';
        near.parentNode.parentNode.insertBefore(hint, near.parentNode);
      }
      hint.className = 'ym-err';
      hint.textContent = text || '';
      near.scrollIntoView({ block: 'center' });
    } else if (el && text && kind !== 'bad') {
      window.scrollTo(0, 0);
    }
  }

  function datesHtml() {
    var dates = ymState.season.pickupDates || [];
    if (!dates.length) return '<div class="tip">尚未設定取餐日。這裡沒有預設日期，也不沿用 2024 的「二月八日前」。</div>';
    return dates.map(function (d) {
      return '<div class="ym-chip"><span>' + YM.esc(d) + (ymState.exampleDemo ? '　範例，不是公告' : '') + '</span><button type="button" data-ymact="del-date" data-date="' + YM.esc(d) + '">移除</button></div>';
    }).join('');
  }

  function listHtml() {
    if (!ymState.items.length) return '<div class="tip">目錄是空的。可以新增，或還原 2024 參考。</div>';
    return ymState.items.map(function (it) {
      var price = it.variants.length
        ? it.variants.map(function (v) { return v.name + ' ' + YM.priceLabel(v, ymState.scope).text; }).join('、')
        : YM.priceLabel(it, ymState.scope).text;
      return '<div class="row"><div class="tx" style="flex:1"><div class="nm wrap">' + (it.histNo ? '<span class="ymtag">舊單 ' + YM.esc(String(it.histNo)) + '</span> ' : '') + YM.esc(it.name || '（未填品名）') + '</div><div class="sub">' + YM.esc(price) + (it.on ? '' : '・已下架') + '・' + YM.esc(YM.unitLabel(it)) + '</div></div><button type="button" class="sbtn" data-ymact="toggle-item" data-id="' + YM.esc(it.id) + '">' + (it.on ? '上架中' : '已下架') + '</button><button type="button" class="sbtn" style="background:#3f7d3a" data-ymact="edit" data-id="' + YM.esc(it.id) + '">修改</button></div>';
    }).join('');
  }

  function ordersHtml() {
    var orders = [];
    try { orders = YM.loadOrders(); } catch (e) { orders = []; }
    var head = '<div class="gh">這台裝置的預覽單（' + orders.length + '）</div><div class="tip">這些單不會出現在接單清單，也不會列印、不會傳 LINE。</div>';
    if (!orders.length) return head + '<div class="tip">還沒有預覽單。</div>';
    return head + '<div class="grp">' + orders.slice().reverse().map(function (o) {
      return '<div class="row"><div class="tx"><div class="nm wrap"><span class="ym-demo">範例</span> ' + YM.esc(o.id || '') + '</div><div class="sub">$' + YM.esc(String(o.total || 0)) + '・取餐日 ' + YM.esc(o.pickupDate || '未填') + '</div></div></div>';
    }).join('') + '</div>';
  }

  function paint(opts) {
    if (!opts || !opts.skipCapture) captureSeason();
    var s = ymState.season;
    var src = ymState.scope === 'device-local-preview' ? 'device' : 'seed';
    var banner = '<div class="ym-prov" id="ymProv"><span class="ym-demo">歷史參考</span><b>2024 年 Facebook 舊菜單，尚未經本季確認。</b><br>系統不會把它當成已核對的本季菜單。舊文的「二月八日前」沒有設成截止日。八張沒有品名的舊照片也不會拿來對菜。</div>';
    banner += '<div class="ym-scope">儲存範圍：只寫這台瀏覽器（localStorage）。不是全店同步，沒有寫入 Google 試算表，也不會改到便當菜單。Apps Script 要等另行核准才接得上，現在沒有接。</div>';
    if (window.YM_PREVIEW) banner += '<div class="ym-scope"><span class="ym-demo">範例</span>離線預覽：沒有登入正式接單，沒有向後台要訂單或菜單。</div>';
    if (src === 'device') banner += '<div class="tip">這台裝置上次儲存：' + YM.esc((ymState.savedAt || '').replace('T', ' ').slice(0, 16)) + '。其他手機看不到。</div>';
    else banner += '<div class="tip">還沒按過儲存。現在是內建的 2024 參考；重新整理還在，但不會進其他裝置。</div>';
    if (ymState.exampleDemo) banner += '<div class="ym-scope"><span class="ym-demo">範例</span>取餐日 2027-01-15 是預覽假資料，不是本季公告。</div>';
    var msg = '<div id="ymMsg" class="' + (ymFlash ? (ymFlash.kind === 'ok' ? 'ym-ok' : 'ym-err') : '') + '" role="status">' + YM.esc(ymFlash ? ymFlash.text : '') + '</div>';
    var openOn = s.open ? '1' : '0';
    var html = banner + msg +
      '<div class="gh">本季開關（預設不開放）</div><div class="grp"><button type="button" class="ym-big" id="ymOpenBtn" data-ymact="toggle-open" data-on="' + openOn + '">' + (s.open ? '預購：已設為開放（還要有取餐日；按儲存才留下）' : '預購：尚未開放（按一下切換）') + '</button></div>' +
      '<div class="gh">取餐日</div><div class="grp" id="ymDates">' + datesHtml() + '</div>' +
      '<label class="tip">新增取餐日</label><input class="ym-in" id="ymDateAdd" type="date"><button type="button" class="ym-big" style="background:#3f7d3a" data-ymact="add-date">加入這個取餐日</button>' +
      '<div class="gh">截止、訂金（都可留空）</div><div class="grp">' +
      '<label class="f"><span>截止日</span><input id="ymDeadline" type="date" value="' + YM.esc(s.deadlineDate || '') + '"></label>' +
      '<label class="f"><span>時間</span><input id="ymDeadlineTime" type="time" value="' + YM.esc(s.deadlineTime || '') + '"></label>' +
      '<label class="f"><span>訂金</span><select id="ymDeposit"><option value="unset"' + (s.deposit === 'unset' ? ' selected' : '') + '>尚未設定</option><option value="none"' + (s.deposit === 'none' ? ' selected' : '') + '>不收訂金</option><option value="custom"' + (s.deposit === 'custom' ? ' selected' : '') + '>自訂說明</option></select></label>' +
      '<label class="f"><span>訂金說明</span><input id="ymDepositNote" type="text" maxlength="200" value="' + YM.esc(s.depositNote || '') + '" placeholder="尚未設定就留空"></label>' +
      '<label class="f"><span>取餐說明</span><input id="ymPickupNote" type="text" maxlength="200" value="' + YM.esc(s.pickupNote || '') + '" placeholder="可不填，不會自動產生時段"></label>' +
      '<label class="f"><span>給客人</span><input id="ymCustomerNote" type="text" maxlength="300" value="' + YM.esc(s.customerNote || '') + '" placeholder="可不填"></label></div>' +
      '<p class="tip">2024 舊菜單寫過「二月八日前」。不要把它當成本季截止。真的要定截止日，請用上面的日期欄另選。</p>' +
      '<button type="button" class="ym-big" id="ymSave" data-ymact="save">儲存到這台裝置</button>' +
      (window.YM_PREVIEW ? '<button type="button" class="ym-big" style="background:#8a5a00" data-ymact="example">填入範例取餐日（僅供預覽，不是公告）</button>' : '') +
      '<button type="button" class="ym-big" style="background:#888" data-ymact="reset">還原成 2024 參考（只清這台）</button>' +
      '<div class="gh">年菜品項</div><div class="grp"><button type="button" class="row act" data-ymact="edit" data-id="new">＋ 新增一道（價錢先空白）</button></div>' +
      '<div class="grp" id="ymList">' + listHtml() + '</div>' +
      '<div id="ymEditor"></div>' +
      ordersHtml();
    var body = $('setBody');
    if (!body) return;
    body.innerHTML = html;
    if (ymEditId) renderEditor();
    var flash = ymFlash;
    ymFlash = null;
    if (flash) window.scrollTo(0, 0);
  }
  window.ymStaffPaint = function () { paint(); };

  function renderEditor() {
    var box = $('ymEditor');
    if (!box || !ymDraft) { if (box) box.innerHTML = ''; return; }
    var it = ymDraft;
    var histPrice = it.historicalPrice == null ? '沒有 2024 單一參考價' : ('2024 參考價 $' + it.historicalPrice + '（未經本季確認）');
    var priceVal = it.price == null ? '' : String(it.price);
    box.innerHTML = '<div class="gh">修改品項</div><div class="ym-prov">舊菜單品名：' + YM.esc(it.historicalName || '（沒有，這是新增）') + (it.histNo ? '・舊單 ' + YM.esc(String(it.histNo)) : '') + '<br>' + YM.esc(histPrice) + '</div>' +
      '<div class="grp">' +
      '<label class="f"><span>品名</span><input id="ymEName" type="text" maxlength="30" value="' + YM.esc(it.name || '') + '" placeholder="請填品名"></label>' +
      '<label class="f"><span>單位</span><input id="ymEUnit" type="text" maxlength="8" value="' + YM.esc(it.unit || '') + '" placeholder="未設定（不代猜）"></label>' +
      '<label class="f"><span>內容</span><textarea id="ymEContents" rows="2" maxlength="200">' + YM.esc(it.contents || '') + '</textarea></label>' +
      '<label class="f"><span>備註</span><input id="ymENote" type="text" maxlength="200" value="' + YM.esc(it.note || '') + '"></label>' +
      '<div class="f"><span style="flex:1;width:auto">上架</span><button type="button" class="sbtn' + (it.on ? '' : ' x') + '" id="ymEOn" data-on="' + (it.on ? '1' : '0') + '" data-ymact="toggle-on">' + (it.on ? '上架中' : '已下架') + '</button></div></div>' +
      '<div class="pic"><img id="ymEPic" alt="" style="display:none"><div class="nopic" id="ymENoPic">尚無已核對照片（不會用舊圖猜）</div><div class="pbtn"><button type="button" class="ph" data-ymact="pick-photo">從這台選照片</button><button type="button" class="g2" data-ymact="clear-photo">移除照片</button></div><div id="ymPicMsg" class="tip"></div><p class="tip">照片只留在這台瀏覽器，不會上傳雲端。</p></div>' +
      '<div id="ymPriceBox"></div><div id="ymVarBox"></div>' +
      '<button type="button" class="ym-big" data-ymact="save">儲存到這台裝置</button>' +
      '<button type="button" class="ym-big" style="background:#888" data-ymact="cancel-edit">取消修改</button>' +
      (ymEditId === 'new' ? '' : '<button type="button" class="ym-big" style="background:#c0392b" data-ymact="delete-item">從這份目錄刪除</button>') +
      '<button type="button" class="ym-big" style="background:#3f7d3a" data-ymact="add-var">加上一種規格</button>';
    showPhoto();
    renderPriceBoxes();
    var name = $('ymEName');
    if (name) name.focus();
  }

  function renderPriceBoxes() {
    var priceBox = $('ymPriceBox');
    var varBox = $('ymVarBox');
    if (!priceBox || !varBox || !ymDraft) return;
    if (ymMode === 'single') {
      var shown = ymDraft.price == null ? '' : String(ymDraft.price);
      var field = $('ymEPrice');
      if (field) shown = field.value;
      priceBox.innerHTML = '<div class="gh">價錢</div><div class="prow" style="padding:8px 0"><button type="button" data-ymact="price-delta" data-d="-10">−10</button><input id="ymEPrice" type="text" inputmode="numeric" maxlength="4" value="' + YM.esc(shown) + '" placeholder="未填"><button type="button" data-ymact="price-delta" data-d="10">+10</button></div>' +
        (ymDraft.historicalPrice != null ? '<button type="button" class="ym-big" style="background:#8a5a00" data-ymact="confirm-price">這台確認沿用參考價 $' + ymDraft.historicalPrice + '</button>' : '');
      varBox.innerHTML = '';
    } else {
      priceBox.innerHTML = '<div class="tip">這道有規格，價錢寫在每個規格上，不另外發明一個總價。</div>';
      var rows = ymVarBuffer || scrapeVars();
      ymVarBuffer = null;
      if (!rows.length) rows = (ymDraft.variants || []).map(varToRow);
      varBox.innerHTML = rows.map(function (v) {
        return '<div class="grp" data-vrow data-vid="' + YM.esc(v.id) + '" data-hname="' + YM.esc(v.historicalName || '') + '" data-hprice="' + (v.historicalPrice == null ? '' : String(v.historicalPrice)) + '" data-touched="' + (v.touched ? '1' : '0') + '" data-force="' + (v.force ? '1' : '0') + '" data-confirmed="' + (v.priceConfirmed ? '1' : '0') + '">' +
          '<label class="f"><span>規格</span><input class="ymVName" type="text" maxlength="20" value="' + YM.esc(v.name || '') + '"></label>' +
          '<label class="f"><span>價錢</span><input class="ymVPrice" type="text" inputmode="numeric" maxlength="4" value="' + YM.esc(v.priceText != null ? v.priceText : (v.price == null ? '' : String(v.price))) + '"></label>' +
          '<div class="tip">' + (v.historicalPrice == null ? '沒有 2024 參考價' : ('2024 參考價 $' + v.historicalPrice)) + '</div>' +
          '<div class="f"><span style="flex:1;width:auto">上架</span><button type="button" class="sbtn' + (v.on ? '' : ' x') + ' ymVOn" data-on="' + (v.on ? '1' : '0') + '" data-ymact="toggle-var">' + (v.on ? '上架中' : '已下架') + '</button></div>' +
          (v.historicalPrice != null ? '<button type="button" data-ymact="confirm-var">確認沿用參考價</button>' : '') +
          '<button type="button" data-ymact="del-var">刪除這個規格</button></div>';
      }).join('') || '<div class="tip">還沒有規格。</div>';
    }
  }

  function varToRow(v) {
    return {
      id: v.id, historicalName: v.historicalName || '', historicalPrice: v.historicalPrice, name: v.name || '',
      price: v.price, priceText: v.price == null ? '' : String(v.price), on: v.on !== false,
      touched: false, force: false, priceConfirmed: !!v.priceConfirmed
    };
  }

  function scrapeVars() {
    var list = [];
    document.querySelectorAll('#ymEditor [data-vrow]').forEach(function (row) {
      var hp = row.getAttribute('data-hprice');
      list.push({
        id: row.getAttribute('data-vid'),
        historicalName: row.getAttribute('data-hname') || '',
        historicalPrice: hp === '' || hp == null ? null : Number(hp),
        name: row.querySelector('.ymVName').value,
        priceText: row.querySelector('.ymVPrice').value,
        on: row.querySelector('.ymVOn').getAttribute('data-on') === '1',
        touched: row.getAttribute('data-touched') === '1',
        force: row.getAttribute('data-force') === '1',
        priceConfirmed: row.getAttribute('data-confirmed') === '1'
      });
    });
    return list;
  }

  function showPhoto() {
    var img = $('ymEPic'), none = $('ymENoPic');
    if (!img) return;
    if (ymPhoto) { img.src = ymPhoto; img.alt = '店家選的照片，只在這台'; img.style.display = 'block'; if (none) none.style.display = 'none'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; if (none) none.style.display = 'flex'; }
  }

  function openEditor(id) {
    if (ymEditId && ymEditId !== id) {
      showMsg('bad', '請先儲存或取消正在改的品項，畫面上的字會留著。');
      return;
    }
    if (id === 'new') {
      ymDraft = YM.newItemDraft();
      ymEditId = 'new';
      ymMode = 'single';
    } else {
      var found = null;
      ymState.items.forEach(function (it) { if (it.id === id) found = YM.clone(it); });
      if (!found) { showMsg('bad', '找不到這道菜'); return; }
      ymDraft = found;
      ymEditId = id;
      ymMode = found.variants && found.variants.length ? 'variants' : 'single';
    }
    ymPhoto = ymDraft.photo || '';
    renderEditor();
    var ed = $('ymEditor');
    if (ed) ed.scrollIntoView({ block: 'start' });
  }

  function readEditor() {
    if (!ymDraft || !$('ymEName')) return { ok: false, errors: ['編輯區還沒打開'] };
    var it = YM.clone(ymDraft);
    it.name = $('ymEName').value.trim();
    it.unit = $('ymEUnit').value.trim();
    it.contents = $('ymEContents').value.trim();
    it.note = $('ymENote').value.trim();
    it.on = $('ymEOn').getAttribute('data-on') === '1';
    it.photo = YM.safePhoto(ymPhoto);
    if (ymMode === 'variants') {
      var vars = scrapeVars().map(function (v) {
        var price = money(v.priceText);
        var confirmed = !!v.priceConfirmed;
        if (v.historicalPrice == null) confirmed = price != null;
        else if (v.force) confirmed = true;
        else if (v.touched && price !== v.historicalPrice) confirmed = true;
        else if (v.touched && price === v.historicalPrice) confirmed = false;
        return {
          id: v.id,
          historicalName: v.historicalName,
          name: String(v.name || '').trim(),
          historicalPrice: v.historicalPrice,
          price: price,
          priceConfirmed: confirmed,
          on: v.on
        };
      });
      it.variants = vars;
      it.price = null;
    } else {
      var priceEl = $('ymEPrice');
      var price = money(priceEl ? priceEl.value : '');
      var touched = priceEl && priceEl.getAttribute('data-touched') === '1';
      var force = priceEl && priceEl.getAttribute('data-force') === '1';
      if (it.historicalPrice == null) it.priceConfirmed = price != null;
      else if (force) it.priceConfirmed = true;
      else if (touched && price !== it.historicalPrice) it.priceConfirmed = true;
      else if (touched && price === it.historicalPrice) it.priceConfirmed = false;
      it.price = price;
      it.variants = [];
    }
    var errors = YM.validateItem(it, ymState.items.filter(function (x) { return x.id !== it.id; }));
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, item: it };
  }

  function assemble() {
    captureSeason();
    var state = YM.clone(ymState);
    if (!ymEditId) return { ok: true, state: state };
    var read = readEditor();
    if (!read.ok) return read;
    if (ymEditId === 'new') state.items.push(read.item);
    else {
      var idx = -1;
      state.items.forEach(function (it, i) { if (it.id === ymEditId) idx = i; });
      if (idx < 0) return { ok: false, errors: ['找不到這道菜'] };
      state.items[idx] = read.item;
    }
    return { ok: true, state: state };
  }

  async function saveAll() {
    if (ymBusy) return;
    ymBusy = true;
    document.querySelectorAll('[data-ymact="save"]').forEach(function (b) { b.disabled = true; b.textContent = '儲存中…'; });
    showMsg('load', '儲存中…請稍候，不要連按。');
    try {
      var packed = assemble();
      if (!packed.ok) {
        showMsg('bad', packed.errors.join('\n'));
        return;
      }
      var res = YM.save(packed.state, localStorage);
      if (!res.ok) {
        showMsg('bad', res.errors.join('\n'));
        return;
      }
      ymState = res.state;
      ymEditId = null;
      ymDraft = null;
      var extra = res.warnings && res.warnings.length ? ('\n' + res.warnings.join('\n')) : '';
      ymFlash = { kind: 'ok', text: '已寫進這台瀏覽器 ✅\n沒有寫入 Google 試算表，其他裝置看不到，便當菜單也沒有改。' + extra };
      paint({ skipCapture: true });
    } catch (e) {
      showMsg('bad', '沒有存成：' + (e && e.message ? e.message : e) + '\n畫面上的內容還在。');
    } finally {
      ymBusy = false;
      document.querySelectorAll('[data-ymact="save"]').forEach(function (b) { b.disabled = false; b.textContent = '儲存到這台裝置'; });
    }
  }

  function loadBitmap(file) {
    if (!window.createImageBitmap) return Promise.reject(new Error('img'));
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
  }

  function shrinkFile(file) {
    return loadBitmap(file).then(function (bmp) {
      return drawShrink(bmp.width, bmp.height, function (g, w, h) { g.drawImage(bmp, 0, 0, w, h); if (bmp.close) bmp.close(); });
    }).catch(function () {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var im = new Image();
        im.onload = function () {
          URL.revokeObjectURL(url);
          drawShrink(im.width, im.height, function (g, w, h) { g.drawImage(im, 0, 0, w, h); }).then(resolve, reject);
        };
        im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('這張照片讀不到')); };
        im.src = url;
      });
    });
  }

  function drawShrink(w, h, draw) {
    if (!w || !h) return Promise.reject(new Error('照片大小讀不到'));
    var max = 360, r = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * r));
    c.height = Math.max(1, Math.round(h * r));
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    draw(g, c.width, c.height);
    var data = c.toDataURL('image/jpeg', 0.6);
    if (!YM.safePhoto(data)) return Promise.reject(new Error('縮小後還是太大，沒有存這張照片'));
    return Promise.resolve(data);
  }

  async function onClick(ev) {
    var b = ev.target.closest('[data-ymact]');
    if (!b || !$('setBody') || !$('setBody').contains(b)) return;
    var act = b.getAttribute('data-ymact');
    if (act === 'save') { saveAll(); return; }
    if (act === 'toggle-open') {
      var on = b.getAttribute('data-on') !== '1';
      b.setAttribute('data-on', on ? '1' : '0');
      b.textContent = on ? '預購：已設為開放（還要有取餐日；按儲存才留下）' : '預購：尚未開放（按一下切換）';
      ymState.season.open = on;
      return;
    }
    if (act === 'add-date') {
      var v = $('ymDateAdd').value;
      if (!v) { showMsg('bad', '請先選一個取餐日。這個欄位是空的，沒有預設日期。'); return; }
      if (!YM.isDate(v)) { showMsg('bad', '這個日期不正確'); return; }
      if (ymState.season.pickupDates.indexOf(v) >= 0) { showMsg('bad', '這個日期已經在清單裡'); return; }
      ymState.season.pickupDates.push(v);
      ymState.exampleDemo = false;
      $('ymDates').innerHTML = datesHtml();
      $('ymDateAdd').value = '';
      showMsg('ok', '已加入 ' + v + '。還沒按儲存的話，重新整理不會留下。');
      return;
    }
    if (act === 'del-date') {
      var d = b.getAttribute('data-date');
      ymState.season.pickupDates = ymState.season.pickupDates.filter(function (x) { return x !== d; });
      ymState.exampleDemo = false;
      $('ymDates').innerHTML = datesHtml();
      return;
    }
    if (act === 'edit') { openEditor(b.getAttribute('data-id')); return; }
    if (act === 'toggle-item') {
      var id = b.getAttribute('data-id');
      ymState.items.forEach(function (it) { if (it.id === id) it.on = !it.on; });
      $('ymList').innerHTML = listHtml();
      showMsg('ok', '上架狀態先改在畫面上。按「儲存到這台裝置」才會留下。');
      return;
    }
    if (act === 'cancel-edit') { ymEditId = null; ymDraft = null; paint(); return; }
    if (act === 'toggle-on') {
      var next = b.getAttribute('data-on') !== '1';
      b.setAttribute('data-on', next ? '1' : '0');
      b.textContent = next ? '上架中' : '已下架';
      b.classList.toggle('x', !next);
      return;
    }
    if (act === 'price-delta') {
      var el = $('ymEPrice');
      if (!el) return;
      var n = money(el.value);
      if (n == null) n = 0;
      n = Math.max(0, Math.min(9999, n + Number(b.getAttribute('data-d') || 0)));
      el.value = String(n);
      el.setAttribute('data-touched', '1');
      return;
    }
    if (act === 'confirm-price') {
      var pe = $('ymEPrice');
      if (!pe || ymDraft.historicalPrice == null) return;
      pe.value = String(ymDraft.historicalPrice);
      pe.setAttribute('data-touched', '1');
      pe.setAttribute('data-force', '1');
      showMsg('ok', '已填回參考價，並標成這台裝置確認沿用。整季菜單仍不算已核對。請按儲存。');
      return;
    }
    if (act === 'add-var') {
      ymMode = 'variants';
      var rows = scrapeVars();
      rows.push({ id: 'ymv' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), historicalName: '', historicalPrice: null, name: '', priceText: '', on: true, touched: false, force: false, priceConfirmed: false });
      ymVarBuffer = rows;
      renderPriceBoxes();
      return;
    }
    if (act === 'del-var') {
      var row = b.closest('[data-vrow]');
      if (row) row.remove();
      if (!document.querySelector('#ymEditor [data-vrow]')) { ymMode = 'single'; renderPriceBoxes(); }
      return;
    }
    if (act === 'confirm-var') {
      var row2 = b.closest('[data-vrow]');
      if (!row2) return;
      var hp = row2.getAttribute('data-hprice');
      if (hp) row2.querySelector('.ymVPrice').value = hp;
      row2.setAttribute('data-touched', '1');
      row2.setAttribute('data-force', '1');
      return;
    }
    if (act === 'toggle-var') {
      var next2 = b.getAttribute('data-on') !== '1';
      b.setAttribute('data-on', next2 ? '1' : '0');
      b.textContent = next2 ? '上架中' : '已下架';
      b.classList.toggle('x', !next2);
      return;
    }
    if (act === 'pick-photo') { var pic = $('ymPic'); if (pic) pic.click(); return; }
    if (act === 'clear-photo') { ymPhoto = ''; showPhoto(); var st = $('ymPicMsg'); if (st) st.textContent = '已移除。按儲存後這台才會記住沒有照片。'; return; }
    if (act === 'delete-item') {
      var victim = ymDraft;
      if (!victim || !(await ask({ ic: '🗑', t: '刪除「' + (victim.name || '這道') + '」？', m: '只從這台裝置的年菜目錄拿掉。\n線上便當菜單不會變。\n按了刪除後還要再按儲存才會留下。', ok: '刪除', okc: 'rd' }))) return;
      ymState.items = ymState.items.filter(function (it) { return it.id !== victim.id; });
      ymEditId = null;
      ymDraft = null;
      ymFlash = { kind: 'ok', text: '已從這份畫面拿掉。按「儲存到這台裝置」才會留下；現在還沒寫進瀏覽器紀錄。' };
      paint();
      return;
    }
    if (act === 'example') {
      if (!(await ask({ ic: '🧪', t: '填入範例取餐日？', m: '會放 2027-01-15，並標成範例。\n這不是本季公告，也還沒儲存。', ok: '填入範例', okc: 'or' }))) return;
      captureSeason();
      var keepItems = ymState.items;
      ymState = YM.applyExample(ymState);
      ymState.items = keepItems;
      ymEditId = null;
      ymDraft = null;
      ymFlash = { kind: 'ok', text: '已填入範例取餐日 2027-01-15。這不是本季公告。請按「儲存到這台裝置」。' };
      paint({ skipCapture: true });
      return;
    }
    if (act === 'reset') {
      if (!(await ask({ ic: '↩', t: '還原成 2024 參考？', m: '只清這台瀏覽器的年菜目錄。\n線上便當菜單、訂單都不會變。', ok: '還原', okc: 'rd' }))) return;
      var cleared = YM.clearCatalog(localStorage);
      ymState = cleared.state;
      ymEditId = null;
      ymDraft = null;
      ymFlash = { kind: 'ok', text: '已還原成 2024 參考。線上資料沒有動。' };
      paint({ skipCapture: true });
    }
  }

  var setBody = $('setBody');
  if (setBody) {
    setBody.addEventListener('click', onClick);
    setBody.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.id === 'ymEPrice') t.setAttribute('data-touched', '1');
      if (t.classList && t.classList.contains('ymVPrice')) {
        var row = t.closest('[data-vrow]');
        if (row) row.setAttribute('data-touched', '1');
      }
    });
  }
  var pic = $('ymPic');
  if (pic) pic.addEventListener('change', async function () {
    var f = this.files && this.files[0];
    this.value = '';
    var st = $('ymPicMsg');
    if (!f || !ymEditId) return;
    try {
      if (st) { st.className = 'tip'; st.textContent = '縮小照片中…'; }
      var data = await shrinkFile(f);
      ymPhoto = data;
      showPhoto();
      if (st) st.textContent = '照片已放進這份畫面。還沒按儲存，也不會上傳。';
    } catch (e) {
      if (st) { st.className = 'ym-err'; st.textContent = '照片沒放上去：' + (e && e.message ? e.message : e) + '。原本的照片還在。'; }
    }
  });

  if (window.YM_PREVIEW) {
    document.querySelectorAll('#setv .tabs button').forEach(function (b) {
      if (b.getAttribute('data-t') !== 'year') b.style.display = 'none';
    });
    var title = document.querySelector('#setv .nav b');
    if (title) title.textContent = '年菜預覽・範例';
    var back = document.querySelector('#setv .nav button');
    if (back) back.textContent = '未連正式接單';
    document.title = '年菜預覽・範例（未連線）';
    if (typeof tab === 'function') tab('year');
    else paint();
  }
})();
