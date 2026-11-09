/**
 * 20261109 年菜預購 — 附加程式，尚未核准、尚未部署。
 * GitHub Pages 不會執行這個檔。不要覆蓋現有接單程式，也不要在老闆點頭前把它接進 doGet / doPost。
 *
 * 這次網頁預覽完全不會呼叫這裡。年菜目前只存在客人／店員那台瀏覽器的 localStorage。
 *
 * 以後若要全店同步，需另一次核准，順序如下：
 * 1. 打開「現在正在用」的那個 Apps Script 專案（跟網頁同一個，不要新建一個沒接上的專案）。
 * 2. 新增檔案，整份貼上。不要改現有的訂單、菜單、列印、LINE。
 * 3. 先不要改 doGet / doPost。在編輯器執行 yearmealSelfCheck，只會回一句話，不會寫試算表。
 * 4. 把 ymPinOk_ 改成呼叫你們現在的店員密碼檢查。不要在這個檔寫死密碼，也不要另做一套密碼。
 * 5. 試算表若不是綁在這個專案上，把試算表 ID 放到指令碼屬性 YEARMEAL_SSID。不要把 ID 寫進程式。
 * 6. 老闆同意後，才把指令碼屬性 YEARMEAL_APPROVED 設成 yes。
 * 7. 還是不要接上，直到另一次改網頁：預覽版故意沒有 fetch。接上時只能把 action
 *    yearmeal_get、yearmeal_save、yearorder 指到 yearmealApi_，而且存檔／下單要求 body.confirmLive === true。
 * 8. 用測試部署打 yearmeal_get。確認「菜單」與「訂單」工作表完全沒變，接單頁的今日單也沒變。
 * 9. 最後才部署正式版本。部署前，舊網址不會有這些 action。
 *
 * 即使將來接上，這個檔也只讀寫「年菜目錄」「年菜訂單」兩張表，不碰便當訂單，所以不會變成今天的備餐。
 * 沒有 LINE、沒有印表機指令。
 */
var YM_CATALOG_SHEET = '年菜目錄';
var YM_ORDER_SHEET = '年菜訂單';

function yearmealSelfCheck() {
  return '年菜程式在專案裡，但預設拒絕讀寫。網頁預覽不會呼叫這裡。要等 YEARMEAL_APPROVED=yes，而且另一次改網頁才會連線。';
}

function ymApproved_() {
  var v = PropertiesService.getScriptProperties().getProperty('YEARMEAL_APPROVED');
  return v === 'yes';
}

function ymReject_(code, message) {
  return { ok: false, error: code || 'yearmeal-not-approved', message: message || '年菜後端尚未核准，拒絕讀寫' };
}

function ymPinOk_(pin) {
  // 預設永遠不通過。接上時改成呼叫現有密碼檢查，例如 return existingPinOk_(pin);
  // 不要在這裡寫密碼。
  if (typeof shopPinOk_ === 'function') return shopPinOk_(String(pin || ''));
  return false;
}

function ymSs_() {
  var id = PropertiesService.getScriptProperties().getProperty('YEARMEAL_SSID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('no-spreadsheet');
  return ss;
}

function ymSheet_(name, create) {
  var ss = ymSs_();
  var sh = ss.getSheetByName(name);
  if (!sh && create) sh = ss.insertSheet(name);
  return sh;
}

function ymJsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ymReadBody_(e) {
  var raw = '';
  if (e && e.postData && e.postData.contents) raw = e.postData.contents;
  else if (e && e.parameter && e.parameter.data) raw = e.parameter.data;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (err) { return { _badJson: true }; }
}

function ymCatalogGet_() {
  var sh = ymSheet_(YM_CATALOG_SHEET, false);
  if (!sh) return { ok: true, missing: true, state: null, scope: 'gas-missing' };
  var raw = String(sh.getRange('A1').getValue() || '');
  if (!raw) return { ok: true, missing: true, state: null, scope: 'gas-empty' };
  try {
    var state = JSON.parse(raw);
    return { ok: true, missing: false, state: state, scope: 'gas', verifiedCurrentSeason: false };
  } catch (err) {
    return ymReject_('bad-catalog', '年菜目錄儲存格不是 JSON，沒有覆寫');
  }
}

function ymCatalogSave_(body) {
  if (body.confirmLive !== true) return ymReject_('confirm-required', '沒有 confirmLive，拒絕寫入。現在的預覽網頁不會帶這個欄位。');
  if (!ymPinOk_(body.pin)) return ymReject_('pin', '密碼不對或尚未接上現有密碼檢查');
  if (!body.state || typeof body.state !== 'object') return ymReject_('state', '沒有目錄內容');
  body.state.verifiedCurrentSeason = false;
  var sh = ymSheet_(YM_CATALOG_SHEET, true);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sh.getRange('A1').setValue(JSON.stringify(body.state));
    sh.getRange('B1').setValue('device-written ' + new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
  return { ok: true, scope: 'gas', verifiedCurrentSeason: false };
}

function ymOrderSave_(body) {
  if (body.confirmLive !== true) return ymReject_('confirm-required', '沒有 confirmLive，拒絕寫入年菜訂單。');
  if (!body.order || body.order.demo === true) return ymReject_('demo', '範例單拒絕寫入試算表');
  var sh = ymSheet_(YM_ORDER_SHEET, true);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var col = sh.getLastRow() + 1;
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, 4).setValues([['時間', '編號', '取餐日', 'JSON']]);
      col = 2;
    }
    sh.getRange(col, 1, 1, 4).setValues([[new Date(), String(body.order.id || ''), String(body.order.pickupDate || ''), JSON.stringify(body.order)]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, scope: 'gas-year-order-only' };
}

/**
 * 給以後的 doGet/doPost 呼叫。現在沒有人呼叫它。
 * 不要在這個函式裡處理便當 action。
 */
function yearmealApi_(e) {
  if (!ymApproved_()) return ymJsonOut_(ymReject_());
  var action = '';
  if (e && e.parameter && e.parameter.action) action = String(e.parameter.action);
  var body = ymReadBody_(e);
  if (body._badJson) return ymJsonOut_(ymReject_('json', '內容不是 JSON，沒有寫入'));
  if (!action && body.action) action = String(body.action);
  try {
    if (action === 'yearmeal_get') return ymJsonOut_(ymCatalogGet_());
    if (action === 'yearmeal_save') return ymJsonOut_(ymCatalogSave_(body));
    if (action === 'yearorder') return ymJsonOut_(ymOrderSave_(body));
  } catch (err) {
    return ymJsonOut_(ymReject_('gas', String(err && err.message ? err.message : err)));
  }
  return ymJsonOut_(ymReject_('action', '不是年菜 action，交給原本的程式'));
}
