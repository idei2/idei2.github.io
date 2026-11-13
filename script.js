/* Порешина Tattoo — сайт-визитка с онлайн-записью */
(() => {
  'use strict';

  /* ============ НАСТРОЙКИ ============ */
  const CONFIG = {
    // Адрес веб-приложения Google Apps Script (заканчивается на /exec).
    // Инструкция в файле apps-script/README.md. Пока пусто, запись не отправляется.
    endpoint: '',
    tz: 'Europe/Moscow',
    firstHour: 7,
    lastHour: 23,
    daysAhead: 30,
    maxFiles: 3
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ============ Появление блоков ============ */
  const rises = $$('.rise');
  rises.forEach((el) => el.style.setProperty('--d', (reduce ? 0 : Number(el.dataset.d || 0)) + 'ms'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      let step = 0;
      entries.filter((e) => e.isIntersecting).forEach((e) => {
        // однородные элементы, вошедшие в кадр вместе, идут лесенкой по 50 мс
        if (!reduce && step) e.target.style.setProperty('--d', (Number(e.target.dataset.d || 0) + step * 50) + 'ms');
        step++;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rises.forEach((el) => io.observe(el));
  } else {
    rises.forEach((el) => el.classList.add('is-in'));
  }

  /* ============ Шапка и меню ============ */
  const hdr = $('.hdr');
  const onScroll = () => hdr.classList.toggle('is-solid', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const burger = $('.burger');
  const menu = $('#menu');
  const setMenu = (open) => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    if (open) { menu.hidden = false; }
    else { setTimeout(() => { if (!document.body.classList.contains('menu-open')) menu.hidden = true; }, 800); }
  };
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ============ Каталог: превью работы за курсором ============ */
  const peek = $('.peek');
  if (peek && !reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const img = $('img', peek);
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      peek.style.transform = `translate3d(${x + 36}px, ${y - 140}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    $$('.svc').forEach((row) => {
      row.addEventListener('pointerenter', (e) => {
        img.src = row.dataset.preview;
        x = tx = e.clientX; y = ty = e.clientY;
        peek.classList.add('is-on');
        if (!raf) loop();
      });
      row.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
      row.addEventListener('pointerleave', () => {
        peek.classList.remove('is-on');
        cancelAnimationFrame(raf); raf = 0;
      });
    });
  }

  /* ============ Работы: просмотр ============ */
  const lb = $('#lightbox');
  const works = $$('.work');
  if (lb && works.length) {
    const lbImg = $('.lb__img', lb);
    let cur = 0;
    const show = (i) => {
      cur = (i + works.length) % works.length;
      lbImg.src = works[cur].dataset.full;
      lbImg.alt = works[cur].dataset.alt || '';
    };
    works.forEach((w, i) => w.addEventListener('click', () => { show(i); lb.showModal(); }));
    $('.lb__close', lb).addEventListener('click', () => lb.close());
    $('.lb__prev', lb).addEventListener('click', () => show(cur - 1));
    $('.lb__next', lb).addEventListener('click', () => show(cur + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    });
  }

  /* ============ Политика ============ */
  const policy = $('#policy');
  if (policy) {
    ['#openPolicy', '#openPolicy2'].forEach((sel) => {
      const b = $(sel);
      if (b) b.addEventListener('click', () => policy.showModal());
    });
    $('.policy__close', policy).addEventListener('click', () => policy.close());
    policy.addEventListener('click', (e) => { if (e.target === policy) policy.close(); });
  }

  /* ============ Запись ============ */
  const form = $('#bookingForm');
  if (!form) return;

  const els = {
    service: $('#fService'), promo: $('#fPromo'),
    dates: $('#dates'), slots: $('#slots'), slotsNote: $('#slotsNote'),
    name: $('#fName'), phone: $('#fPhone'), tg: $('#fTg'),
    idea: $('#fIdea'), place: $('#fPlace'), size: $('#fSize'),
    files: $('#fFiles'), refs: $('#refsList'),
    trap: $('#fTrap'), consent: $('#fConsent'),
    error: $('#formError'), submit: $('#submitBtn'), label: $('#submitLabel'),
    summary: $('#summary'), done: $('#done'), doneWhen: $('#doneWhen')
  };
  const hasEndpoint = () => /^https:\/\/script\.google\.com\//.test(CONFIG.endpoint);
  const state = { date: '', time: '', busy: new Set(), loaded: false, loadFailed: false, files: [], sending: false };

  /* --- Время по Москве --- */
  const mskNow = () => {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONFIG.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  };
  const addDays = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const dateParts = (iso) => {
    const d = new Date(iso + 'T12:00:00Z');
    return {
      wd: d.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
      day: d.getUTCDate(),
      mon: d.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
      long: d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    };
  };

  /* --- Дни --- */
  const buildDates = () => {
    const now = mskNow();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < CONFIG.daysAhead; i++) {
      const iso = addDays(now.date, i);
      const p = dateParts(iso);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'date';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.date = iso;
      b.setAttribute('aria-label', p.long);
      b.innerHTML = `<span class="date__wd">${p.wd}</span><span class="date__d">${p.day}</span><span class="date__m">${p.mon}</span>`;
      if (i === 0 && now.hour >= CONFIG.lastHour) b.disabled = true;
      b.addEventListener('click', () => selectDate(iso));
      frag.appendChild(b);
    }
    els.dates.appendChild(frag);
  };

  const slotKey = (date, h) => `${date}T${pad2(h)}:00`;

  const renderSlots = () => {
    els.slots.innerHTML = '';
    els.slotsNote.hidden = true;
    if (!state.date) {
      els.slots.innerHTML = '<p class="slots__hint">Сначала выберите день</p>';
      return;
    }
    if (!state.loaded) { skeleton(); return; }
    const now = mskNow();
    let free = 0;
    for (let h = CONFIG.firstHour; h <= CONFIG.lastHour; h++) {
      const key = slotKey(state.date, h);
      const past = state.date === now.date && h <= now.hour;
      const busy = state.busy.has(key);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.textContent = `${pad2(h)}:00`;
      b.dataset.time = `${pad2(h)}:00`;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state.time === b.dataset.time));
      if (past || busy) {
        b.disabled = true;
        b.setAttribute('aria-label', `${pad2(h)}:00, ${busy ? 'занято' : 'время прошло'}`);
      } else {
        free++;
        b.addEventListener('click', () => selectTime(b.dataset.time));
      }
      els.slots.appendChild(b);
    }
    if (state.loadFailed) {
      els.slotsNote.textContent = 'Не удалось проверить занятое время. Выберите удобное, при отправке мы всё проверим.';
      els.slotsNote.hidden = false;
    } else if (!free) {
      els.slotsNote.textContent = 'На этот день свободного времени нет. Выберите другой день.';
      els.slotsNote.hidden = false;
    }
  };

  const skeleton = () => {
    els.slots.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.className = 'slot slot--skel';
      els.slots.appendChild(s);
    }
  };

  const updateSummary = () => {
    if (state.date && state.time) {
      els.summary.textContent = `${dateParts(state.date).long}, ${state.time}. Время закрепится за вами`;
    } else {
      els.summary.textContent = 'Выбранное время закрепится за вами';
    }
  };

  const selectDate = (iso) => {
    state.date = iso;
    state.time = '';
    $$('.date', els.dates).forEach((d) => d.setAttribute('aria-checked', String(d.dataset.date === iso)));
    renderSlots();
    updateSummary();
  };
  const selectTime = (t) => {
    state.time = t;
    $$('.slot', els.slots).forEach((s) => s.setAttribute('aria-checked', String(s.dataset.time === t)));
    updateSummary();
    clearError();
  };

  /* --- Занятое время с сервера --- */
  const loadBusy = async () => {
    if (!hasEndpoint()) { state.loaded = true; return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(`${CONFIG.endpoint}?action=slots&_=${Date.now()}`, { signal: ctrl.signal });
      const j = await r.json();
      state.busy = new Set(Array.isArray(j.busy) ? j.busy : []);
      state.loadFailed = false;
    } catch (_) {
      state.loadFailed = true;
    } finally {
      clearTimeout(timer);
      state.loaded = true;
    }
  };

  /* --- Телефон --- */
  const fmtPhone = (v) => {
    let d = v.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    let o = '+7';
    if (d.length > 1) o += ' (' + d.slice(1, 4);
    if (d.length >= 4) o += ')';
    if (d.length > 4) o += ' ' + d.slice(4, 7);
    if (d.length > 7) o += '-' + d.slice(7, 9);
    if (d.length > 9) o += '-' + d.slice(9, 11);
    return o;
  };
  els.phone.addEventListener('input', (e) => {
    if (e.inputType && e.inputType.startsWith('delete') && els.phone.value.replace(/\D/g, '').length <= 1) {
      els.phone.value = '';
      return;
    }
    els.phone.value = fmtPhone(els.phone.value);
  });
  els.tg.addEventListener('blur', () => {
    const v = els.tg.value.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    els.tg.value = v ? '@' + v : '';
  });

  /* --- Референсы --- */
  const resize = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k);
      c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        if (!blob) return reject(new Error('blob'));
        const fr = new FileReader();
        fr.onload = () => resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', data: fr.result, thumb: URL.createObjectURL(blob) });
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      }, 'image/jpeg', 0.82);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    im.src = url;
  });

  const renderRefs = () => {
    els.refs.innerHTML = '';
    state.files.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'ref';
      li.innerHTML = `<img alt=""><button type="button" aria-label="Убрать фото"><svg aria-hidden="true"><use href="#i-close"/></svg></button>`;
      $('img', li).src = f.thumb;
      $('button', li).addEventListener('click', () => { state.files.splice(i, 1); renderRefs(); });
      els.refs.appendChild(li);
    });
  };
  els.files.addEventListener('change', async () => {
    const list = Array.from(els.files.files).slice(0, CONFIG.maxFiles - state.files.length);
    for (const f of list) {
      if (!/^image\//.test(f.type)) continue;
      try { state.files.push(await resize(f)); } catch (_) { showError('Не удалось прочитать одно из фото. Попробуйте другое.'); }
    }
    els.files.value = '';
    renderRefs();
  });

  /* --- Подстановка услуги и акции из кнопок --- */
  const setSelect = (sel, text) => {
    const opt = Array.from(sel.options).find((o) => o.text.startsWith(text));
    if (opt) sel.value = opt.value || opt.text;
  };
  $$('[data-service]').forEach((a) => a.addEventListener('click', () => setSelect(els.service, a.dataset.service)));
  $$('[data-promo]').forEach((a) => a.addEventListener('click', () => setSelect(els.promo, a.dataset.promo)));

  /* --- Ошибки --- */
  const showError = (msg) => { els.error.textContent = msg; els.error.hidden = false; };
  const clearError = () => { els.error.hidden = true; };
  const mark = (el, bad) => { const f = el.closest('.field, .check'); if (f) f.classList.toggle('is-bad', bad); };
  ['input', 'change'].forEach((ev) => form.addEventListener(ev, (e) => { mark(e.target, false); }));

  const validate = () => {
    let first = null;
    const bad = (el) => { mark(el, true); if (!first) first = el; };
    if (els.name.value.trim().length < 2) bad(els.name);
    if (els.phone.value.replace(/\D/g, '').length < 11) bad(els.phone);
    if (!els.consent.checked) bad(els.consent);
    if (first) {
      showError('Проверьте выделенные поля: имя, телефон и согласие на обработку данных.');
      first.focus();
      return false;
    }
    if (!state.date || !state.time) {
      showError('Выберите день и время сеанса.');
      $('#dates').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      return false;
    }
    return true;
  };

  /* --- Отправка --- */
  const setSending = (on) => {
    state.sending = on;
    els.submit.disabled = on;
    els.label.textContent = on ? 'Отправляем заявку' : 'Записаться на сеанс';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.sending) return;
    clearError();
    if (!validate()) return;
    if (!hasEndpoint()) {
      showError('Онлайн-запись пока не подключена. Позвоните +7 936 777-70-66 или напишите в Telegram.');
      return;
    }
    const payload = {
      name: els.name.value.trim(),
      phone: els.phone.value.trim(),
      telegram: els.tg.value.trim(),
      service: els.service.value,
      promo: els.promo.value,
      place: els.place.value,
      size: els.size.value,
      idea: els.idea.value.trim(),
      date: state.date,
      time: state.time,
      files: state.files.map((f) => ({ name: f.name, data: f.data })),
      website: els.trap.value
    };
    setSending(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      const j = await r.json();
      if (j && j.ok) {
        els.doneWhen.textContent = `${dateParts(state.date).long}, ${state.time}`;
        form.hidden = true;
        els.done.hidden = false;
        els.done.focus();
        els.done.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        state.busy.add(slotKey(state.date, Number(state.time.slice(0, 2))));
      } else if (j && j.error === 'busy') {
        showError('Это время только что заняли. Выберите другое.');
        state.time = '';
        await loadBusy();
        renderSlots();
        updateSummary();
      } else if (j && j.error === 'too_many') {
        showError('Слишком много заявок с этого номера. Позвоните +7 936 777-70-66.');
      } else if (j && j.error === 'invalid') {
        showError('Не получилось принять заявку. Проверьте поля и время.');
      } else {
        showError('Сервер не ответил. Попробуйте ещё раз или позвоните +7 936 777-70-66.');
      }
    } catch (_) {
      showError('Нет связи с сервером записи. Попробуйте ещё раз или позвоните +7 936 777-70-66.');
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  });

  /* --- Старт --- */
  buildDates();
  renderSlots();
  loadBusy().then(() => { if (state.date) renderSlots(); });
})();
