import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'yearmeal.js'), 'utf8'), sandbox, { filename: 'yearmeal.js' });
const YM = sandbox.YM;

function mem() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (this.fail) throw new Error('quota'); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    fail: false
  };
}

test('2024 seed has 13 historical dishes and no invented season rules', () => {
  const s = YM.seedState();
  assert.equal(s.items.length, 13);
  assert.deepEqual(JSON.parse(JSON.stringify(s.items.map(i => i.histNo))), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  const by = Object.fromEntries(s.items.map(i => [i.id, i]));
  assert.equal(by.ym01.name, '佛跳牆');
  assert.equal(by.ym01.price, 800);
  assert.equal(by.ym02.name, '鮑魚排翅');
  assert.equal(by.ym04.name, '梅干扣肉');
  assert.equal(by.ym06.name, '百果猴菇');
  assert.equal(by.ym09.name, '髮菜豆腦');
  assert.equal(by.ym09.name.includes('薑'), false);
  assert.equal(by.ym08.contents, '黑豆、烤鰻、蓮藕、煙燻素鵝、香菇素雞、水晶脆藻');
  assert.equal(by.ym10.unit, '斤');
  assert.equal(JSON.stringify(by.ym10.variants.map(v => [v.name, v.price])), JSON.stringify([['紅豆', 150], ['原味', 135]]));
  assert.equal(by.ym11.name, '港式蘿蔔糕');
  assert.equal(by.ym11.price, 150);
  assert.equal(by.ym12.unit, '條');
  assert.equal(by.ym12.price, 350);
  assert.equal(by.ym13.unit, '斤');
  assert.equal(by.ym13.price, 120);
  for (const id of ['ym01', 'ym02', 'ym03', 'ym04', 'ym05', 'ym06', 'ym07', 'ym08', 'ym09', 'ym11']) {
    assert.equal(by[id].unit, '', id + ' should not invent a unit');
    assert.equal(by[id].historicalUnit, '');
  }
  assert.equal(s.season.open, false);
  assert.equal(JSON.stringify(s.season.pickupDates), '[]');
  assert.equal(s.season.deadlineDate, '');
  assert.equal(s.season.deposit, 'unset');
  assert.equal(s.provenance.verifiedCurrentSeason, false);
  const blob = JSON.stringify(s);
  assert.equal(blob.includes('二月八'), false);
  assert.equal(blob.includes('薑菜'), false);
  assert.equal(blob.includes('.jpg'), false);
  assert.equal(s.items.every(i => i.photo === '' && i.priceConfirmed === false), true);
  assert.match(YM.priceLabel(by.ym01, s.scope).text, /2024 參考價/);
  assert.match(YM.unitLabel(by.ym01), /未設定/);
  assert.match(YM.unitLabel(by.ym10), /斤/);
  assert.match(YM.VEG_NOTE, /素食/);
});

test('closed season rejects order and keeps the draft', () => {
  const draft = { name: '範例甲', phone: '0900000000', note: '不要葱', pickupDate: '', lines: [{ itemId: 'ym01', qty: 2 }] };
  const r = YM.buildOrder(YM.seedState(), draft);
  assert.equal(r.ok, false);
  assert.equal(draft.name, '範例甲');
  assert.equal(draft.note, '不要葱');
  assert.ok(r.errors.some(e => /尚未開放|取餐/.test(e)));
});

test('example season is explicit and still historical prices', () => {
  const ex = YM.applyExample(YM.seedState());
  assert.equal(ex.exampleDemo, true);
  assert.equal(JSON.stringify(ex.season.pickupDates), JSON.stringify(['2027-01-15']));
  assert.equal(ex.season.deadlineDate, '');
  assert.equal(ex.season.deposit, 'unset');
  assert.equal(ex.items[0].priceConfirmed, false);
  assert.equal(JSON.stringify(ex.season).includes('二月八'), false);
  const store = mem();
  const saved = YM.save(ex, store);
  assert.equal(saved.ok, true);
  const draft = {
    name: '範例客人', phone: '範例電話', note: '範例備註', pickupDate: '2027-01-15',
    lines: [
      { itemId: 'ym01', qty: 2 },
      { itemId: 'ym10', variantId: 'ym10a', qty: 1 },
      { itemId: 'ym10', variantId: 'ym10b', qty: 3 }
    ]
  };
  const built = YM.buildOrder(saved.state, draft);
  assert.equal(built.ok, true, built.errors && built.errors.join(','));
  assert.equal(built.order.total, 800 * 2 + 150 + 135 * 3);
  assert.equal(built.order.demo, true);
  assert.equal(built.order.lines.find(l => l.itemId === 'ym01').unitUnset, true);
  assert.equal(built.order.lines.find(l => l.variantId === 'ym10a').unit, '斤');
  assert.ok(built.order.notSent.includes('printer'));
  assert.ok(built.order.notSent.includes('line'));
  assert.ok(built.order.notSent.includes('live-order-queue'));
  const stored = YM.storeOrder(built.order, store);
  assert.equal(stored.ok, true);
  assert.equal(YM.loadOrders(store).length, 1);
  assert.equal(YM.load(store).state.provenance.verifiedCurrentSeason, false);
});

test('shop price edit round-trips only on this device store', () => {
  const store = mem();
  const s = YM.seedState();
  s.items[0].price = 880;
  s.items[0].priceConfirmed = true;
  s.provenance.verifiedCurrentSeason = true;
  const saved = YM.save(s, store);
  assert.equal(saved.ok, true);
  const loaded = YM.load(store);
  assert.equal(loaded.source, 'device');
  assert.equal(loaded.state.items[0].price, 880);
  assert.equal(loaded.state.items[0].historicalPrice, 800);
  assert.equal(loaded.state.items[0].priceConfirmed, true);
  assert.equal(loaded.state.provenance.verifiedCurrentSeason, false);
  assert.match(YM.priceLabel(loaded.state.items[0], loaded.state.scope).text, /這台裝置/);
});

test('invalid season or duplicate variant does not overwrite storage', () => {
  const store = mem();
  const open = YM.seedState();
  open.season.open = true;
  const bad = YM.save(open, store);
  assert.equal(bad.ok, false);
  assert.equal(store.getItem(YM.STORAGE_KEY), null);
  const dup = YM.seedState();
  dup.items.find(i => i.id === 'ym10').variants[1].name = '紅豆';
  const store2 = mem();
  assert.equal(YM.save(dup, store2).ok, false);
  assert.equal(store2.getItem(YM.STORAGE_KEY), null);
  const blank = YM.seedState();
  blank.items[0].name = '';
  assert.equal(YM.save(blank, mem()).ok, false);
});

test('storage failure and corrupt json keep previous bytes', () => {
  const store = mem();
  store.fail = true;
  const r = YM.save(YM.seedState(), store);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(''), /存不下/);
  assert.equal(store.getItem(YM.STORAGE_KEY), null);
  store.fail = false;
  store.setItem(YM.STORAGE_KEY, '{');
  const loaded = YM.load(store);
  assert.equal(loaded.source, 'seed');
  assert.equal(loaded.error, 'bad-json');
  assert.equal(store.getItem(YM.STORAGE_KEY), '{');
});

test('unsafe photo strings are dropped', () => {
  assert.equal(YM.safePhoto('javascript:alert(1)'), '');
  assert.equal(YM.safePhoto('https://example.com/a.jpg'), '');
  const s = YM.seedState();
  s.items[0].photo = 'https://evil.example/a.jpg';
  const saved = YM.save(s, mem());
  assert.equal(saved.ok, true);
  assert.equal(saved.state.items[0].photo, '');
});

test('bento files stay free of year-meal network calls', () => {
  const menu = fs.readFileSync(path.join(root, 'menu.js'), 'utf8');
  assert.equal(menu.includes('佛跳牆'), false);
  assert.equal(menu.includes('養生十穀米餐盒'), true);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /items:M\.map\(\(m,i\)=>q\[i\]\?\{n:m\[1\],q:q\[i\]\}:null\)/);
  assert.match(index, /x\.cat!=='年菜預購'/);
  assert.match(index, /ymOnMenuRender/);
  assert.match(index, /預覽版・不是正式預購/);
  assert.match(fs.readFileSync(path.join(root, 'yearmeal-customer.js'), 'utf8'), /這不是訂單，也沒有預約成功/);
  assert.match(fs.readFileSync(path.join(root, 'yearmeal-staff.js'), 'utf8'), /不是正式年菜接單/);
  const staff = fs.readFileSync(path.join(root, 'staff.html'), 'utf8');
  assert.match(staff, /function printOrder\(o\)\{const L=labelsOf\(o\);if\(!L\.length\)\{toast\('沒有要印的品項'\);return\}/);
  assert.match(staff, /0x1d,0x76,0x30,0/);
  assert.match(staff, /out\.push\(0x0a,0x0a,0x0a\);return out\}/);
  assert.match(staff, /function reprint\(id\)\{const o=find\(id\);if\(o\)\{printOrder\(o\);onPrinted\(id\)\}\}/);
  assert.match(staff, /if\(st=='已接單'\)printOrder\(o\)/);
  assert.match(staff, /window\.YM_PREVIEW/);
  for (const file of ['yearmeal.js', 'yearmeal-customer.js', 'yearmeal-staff.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes('script.google.com'), false, file);
    assert.equal(text.includes('GAS_URL'), false, file);
    assert.equal(text.includes('ly_pin'), false, file);
    assert.equal(text.includes('ly_mine'), false, file);
    assert.equal(text.includes('line.me'), false, file);
  }
  const gas = fs.readFileSync(path.join(root, 'gas/20261109-yearmeal-append.gs'), 'utf8');
  assert.equal(/function doGet/.test(gas), false);
  assert.equal(/function doPost/.test(gas), false);
  assert.match(gas, /YEARMEAL_APPROVED/);
  assert.match(gas, /confirmLive/);
  assert.equal(gas.includes('AKfyc'), false);
});
