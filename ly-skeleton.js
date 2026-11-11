// 20261111 蓮緣骨架畫面：照抄記帳 App 的 show/hide，但主要接在「第一次載入菜單／訂單」而不是站內換頁。
// 之後定期 poll／重整時不要每次把現有列表換成骨架（會閃爍）。
(function () {
  var timer = null;
  var markup = '<div class="skeleton h1"></div><div class="skeleton line w80"></div><div class="skeleton line w60"></div>' +
    '<div class="skeleton card"></div><div class="skeleton card"></div><div class="skeleton line w40"></div>' +
    '<div class="skeleton card"></div><p class="skeleton-msg">載入中…</p>';
  function rootOf(el) {
    return el || document.querySelector('main') || document.getElementById('menuSecs') || document.getElementById('list') || document.body;
  }
  function skip(a, e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;
    if (a.target && a.target !== '_self' && a.target !== '_top') return true;
    if (a.hasAttribute('download') || a.hasAttribute('data-no-skeleton')) return true;
    var raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#' || /^(javascript|mailto|tel|sms|blob|data|intent):/i.test(raw)) return true;
    if (/rawbt/i.test(raw)) return true; // RawBT intent 不是換頁
    var u;
    try { u = new URL(a.href, location.href); } catch (_) { return true; }
    if (u.origin !== location.origin) return true;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return true;
    if (/\.(xlsx|csv|pdf|png|jpe?g|heic|webp|zip)$/i.test(u.pathname)) return true;
    return false;
  }
  function show(el) {
    var main = rootOf(el);
    if (!main || main.classList.contains('is-loading')) return;
    var w = document.createElement('div');
    w.className = 'skeleton-wrap'; w.setAttribute('aria-hidden', 'true');
    w.innerHTML = markup;
    main.insertBefore(w, main.firstChild);
    main.classList.add('is-loading'); main.setAttribute('aria-busy', 'true');
    window.scrollTo(0, 0);
    clearTimeout(timer);
    timer = setTimeout(function () { hide(main); }, 15000); // 萬一沒換頁或資料沒到，15 秒後把原畫面還回來
  }
  function hide(el) {
    clearTimeout(timer);
    var main = el ? rootOf(el) : document.querySelector('.is-loading');
    if (!main) return;
    main.classList.remove('is-loading'); main.removeAttribute('aria-busy');
    var w = main.querySelector('.skeleton-wrap'); if (w) w.remove();
  }
  // 第一次載入資料才 show；已經有資料或正在顯示就不要再蓋一次（poll 不會閃）
  function showFirst(el) {
    var main = rootOf(el);
    if (!main || main.getAttribute('data-ly-skel-ready') === '1') return;
    show(main);
  }
  function hideFirst(el) {
    var main = rootOf(el);
    if (main) main.setAttribute('data-ly-skel-ready', '1');
    hide(main);
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || skip(a, e)) return;
    setTimeout(function () { if (!e.defaultPrevented) show(); }, 0);
  });
  window.addEventListener('pageshow', function (e) { if (e && e.persisted) hide(); }); // 只有 bfcache 還原時才清掉，第一次載入的骨架不要被 pageshow 立刻藏起來
  window.lySkeleton = { show: show, hide: hide, showFirst: showFirst, hideFirst: hideFirst };
})();
