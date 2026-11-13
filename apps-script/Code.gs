/**
 * Порешина Tattoo — приём заявок и учёт занятого времени.
 * Скрипт привязан к Google Таблице: каждая заявка = строка,
 * письмо уходит владельцу, занятое время отдаётся сайту.
 */
const CFG = {
  OWNER_EMAIL: 'iportal206@gmail.com',
  SHEET: 'Заявки',
  FOLDER: 'Референсы Порешина Tattoo',
  TZ: 'Europe/Moscow',
  FIRST_HOUR: 7,
  LAST_HOUR: 23,
  DAYS_AHEAD: 31,
  MAX_FILES: 3,
  MAX_FILE_BYTES: 3 * 1024 * 1024,
  MAX_PER_HOUR: 3
};
const SVC_SHEET = 'Услуги';
const PROMO_SHEET = 'Акции';
const SVC_HEAD = ['Название', 'Цена', 'Описание', 'Показывать'];
const PROMO_HEAD = ['Название', 'Описание', 'Действует до', 'Показывать'];
const HEAD = ['Создано', 'Дата', 'Время', 'Статус', 'Имя', 'Телефон', 'Telegram', 'Услуга', 'Акция', 'Место', 'Размер', 'Идея', 'Референсы', 'Слот'];

/** Запустите один раз вручную, чтобы выдать разрешения и создать лист и папку. */
function setup() {
  getSheet_();
  getFolder_();
  getSvcSheet_();
  getPromoSheet_();
  MailApp.getRemainingDailyQuota();
}

/** Лист «Услуги»: что показывается в каталоге и в форме записи. */
function getSvcSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SVC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SVC_SHEET);
    sh.appendRow(SVC_HEAD);
    const rows = [
      ['Мужские тату', 5000, 'Ваша татуировка — это история, которая останется с вами навсегда. Доверьте её профессионалам!', 'Да'],
      ['Женские тату', 5000, 'Ваша татуировка — это личное произведение искусства. Доверьте его создание мастеру, который понимает женскую эстетику!', 'Да'],
      ['Мини-тату', 5000, 'Возможность попробовать себя в роли обладателя татуировки без долгих раздумий.', 'Да'],
      ['Перекрытие тату', 5500, 'Хотите дать старой татуировке вторую жизнь? Не нравится рисунок, который раньше казался идеальным?', 'Да'],
      ['Обучение тату', 35000, 'Мечтаете освоить искусство татуировки и превратить увлечение в профессию?', 'Да']
    ];
    sh.getRange(2, 1, rows.length, 4).setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, SVC_HEAD.length).setFontWeight('bold');
    sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 110); sh.setColumnWidth(3, 520); sh.setColumnWidth(4, 110);
    sh.getRange('C2:C200').setWrap(true);
    sh.getRange('D2:D200').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Да', 'Нет'], true).build());
  }
  return sh;
}

/** Лист «Акции»: пустая дата = без срока, после даты акция скрывается сама. */
function getPromoSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PROMO_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROMO_SHEET);
    sh.appendRow(PROMO_HEAD);
    const until = new Date(2026, 11, 31);
    const rows = [
      ['Первое мини-тату со скидкой 10 %', 'Если вы ещё не пробовали, самое время начать. Скидка 10 % на первое мини-тату до 5 см. Эскизы от мастера в подарок, гипоаллергенные материалы.', until, 'Да'],
      ['Полноценное тату по цене часа работы', 'Предложение при нанесении татуировки по выбранному мастером эскизу. Доверьте уникальный дизайн рукам профессионала.', until, 'Да'],
      ['При двух мини-тату третья бесплатно', 'При заказе двух мини-тату третья бесплатно. Подойдёт для первых тату, милых символов или коллекции миниатюр.', until, 'Да'],
      ['Счастливые часы со скидкой 10 %', 'В будние дни с 9 до 14 скидка 10 % на любую татуировку. Сеанс нужно забронировать заранее и указать акцию.', until, 'Да']
    ];
    sh.getRange(2, 1, rows.length, 4).setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PROMO_HEAD.length).setFontWeight('bold');
    sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 520); sh.setColumnWidth(3, 130); sh.setColumnWidth(4, 110);
    sh.getRange('B2:B200').setWrap(true);
    sh.getRange('C2:C200').setNumberFormat('dd.MM.yyyy').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
    sh.getRange('D2:D200').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Да', 'Нет'], true).build());
  }
  return sh;
}

function toIsoDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(v).trim());
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? String(v).trim() : '';
}

function isOn_(v) {
  return String(v == null ? '' : v).trim().toLowerCase() === 'да';
}

/** Каталог и акции для сайта. Кеш на минуту, чтобы не нагружать таблицу. */
function getContent_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('content');
  if (hit) return JSON.parse(hit);

  const today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  const out = { ok: true, services: [], promos: [] };

  const sv = getSvcSheet_();
  if (sv.getLastRow() > 1) {
    sv.getRange(2, 1, sv.getLastRow() - 1, 4).getValues().forEach(function (r) {
      const name = String(r[0] || '').trim();
      if (!name || !isOn_(r[3])) return;
      const price = typeof r[1] === 'number' ? r[1] : String(r[1] || '').trim();
      out.services.push({ name: name.slice(0, 80), price: price, desc: String(r[2] || '').trim().slice(0, 400) });
    });
  }
  const pr = getPromoSheet_();
  if (pr.getLastRow() > 1) {
    pr.getRange(2, 1, pr.getLastRow() - 1, 4).getValues().forEach(function (r) {
      const title = String(r[0] || '').trim();
      if (!title || !isOn_(r[3])) return;
      const until = toIsoDate_(r[2]);
      if (until && until < today) return;
      out.promos.push({ title: title.slice(0, 100), text: String(r[1] || '').trim().slice(0, 500), until: until });
    });
  }
  cache.put('content', JSON.stringify(out), 60);
  return out;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CFG.SHEET);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEET);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange('A:C').setNumberFormat('@');
    sh.getRange('N:N').setNumberFormat('@');
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
    sh.setColumnWidth(12, 360);
    sh.setColumnWidth(13, 280);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Новая', 'Подтверждена', 'Отменено'], true).build();
    sh.getRange('D2:D2000').setDataValidation(rule);
  }
  return sh;
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(CFG.FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CFG.FOLDER);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Занятые слоты. Строка со статусом «Отменено» освобождает время. */
function busySlots_() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  const out = [];
  rows.forEach(function (r) {
    const status = String(r[3] || '').trim().toLowerCase();
    const slot = String(r[13] || '').trim();
    if (slot && status !== 'отменено') out.push(slot);
  });
  return out;
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'slots') {
    const today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
    const busy = busySlots_().filter(function (s) { return s.slice(0, 10) >= today; });
    return json_({ ok: true, busy: busy });
  }
  if (action === 'content') {
    try { return json_(getContent_()); } catch (err) { return json_({ ok: false }); }
  }
  return json_({ ok: true, service: 'poreshina-tattoo-booking' });
}

function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // защита от формул в таблице
  return s;
}

function validate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return 'invalid';
  if (!/^\d{2}:00$/.test(d.time || '')) return 'invalid';
  const h = Number(d.time.slice(0, 2));
  if (h < CFG.FIRST_HOUR || h > CFG.LAST_HOUR) return 'invalid';
  const today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  const nowH = Number(Utilities.formatDate(new Date(), CFG.TZ, 'H'));
  const dayDiff = Math.round((new Date(d.date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
  if (dayDiff < 0 || dayDiff > CFG.DAYS_AHEAD) return 'invalid';
  if (dayDiff === 0 && h <= nowH) return 'invalid';
  if (String(d.name || '').trim().length < 2) return 'invalid';
  if (String(d.phone || '').replace(/\D/g, '').length < 11) return 'invalid';
  return null;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);
    if (d.website) return json_({ ok: true }); // ловушка для ботов

    const bad = validate_(d);
    if (bad) return json_({ ok: false, error: bad });

    const digits = String(d.phone).replace(/\D/g, '');
    const cache = CacheService.getScriptCache();
    const rlKey = 'rl_' + digits;
    const n = Number(cache.get(rlKey) || 0);
    if (n >= CFG.MAX_PER_HOUR) return json_({ ok: false, error: 'too_many' });
    cache.put(rlKey, String(n + 1), 3600);

    const slot = d.date + 'T' + d.time;
    if (busySlots_().indexOf(slot) > -1) return json_({ ok: false, error: 'busy' });

    // Референсы в Drive
    const links = [];
    const files = Array.isArray(d.files) ? d.files.slice(0, CFG.MAX_FILES) : [];
    files.forEach(function (f, i) {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(f.data || ''));
      if (!m) return;
      const bytes = Utilities.base64Decode(m[2]);
      if (bytes.length > CFG.MAX_FILE_BYTES) return;
      const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
      const name = d.date + '_' + d.time.replace(':', '-') + '_' + clean_(d.name, 30) + '_' + (i + 1) + '.' + ext;
      const file = getFolder_().createFile(Utilities.newBlob(bytes, m[1], name));
      links.push(file.getUrl());
    });

    const row = [
      Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm'),
      d.date, d.time, 'Новая',
      clean_(d.name, 80), clean_(d.phone, 20), clean_(d.telegram, 40),
      clean_(d.service, 80), clean_(d.promo, 100), clean_(d.place, 40), clean_(d.size, 20),
      clean_(d.idea, 1500), links.join('\n'), slot
    ];
    const sh = getSheet_();
    sh.appendRow(row);
    const r = sh.getLastRow();
    sh.getRange(r, 1, 1, 3).setNumberFormat('@').setValues([[row[0], row[1], row[2]]]);
    sh.getRange(r, 14).setNumberFormat('@').setValue(slot);

    const body = [
      'Новая запись с сайта',
      '',
      'Когда: ' + d.date + ', ' + d.time + ' (Москва)',
      'Имя: ' + row[4],
      'Телефон: ' + row[5],
      row[6] ? 'Telegram: ' + row[6] : '',
      'Услуга: ' + (row[7] || 'не выбрана'),
      row[8] ? 'Акция: ' + row[8] : '',
      'Место: ' + (row[9] || 'не указано'),
      'Размер: ' + (row[10] || 'не указан'),
      '',
      'Идея:',
      row[11] || 'не описана',
      '',
      links.length ? 'Референсы:\n' + links.join('\n') : 'Референсов нет',
      '',
      'Чтобы освободить время, поставьте в таблице статус «Отменено».',
      SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].filter(function (x, i, a) { return x !== '' || (a[i - 1] !== ''); }).join('\n');

    MailApp.sendEmail({
      to: CFG.OWNER_EMAIL,
      subject: 'Новая запись: ' + d.date + ' ' + d.time + ', ' + row[4],
      body: body
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
