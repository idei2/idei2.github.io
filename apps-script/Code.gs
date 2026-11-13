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
const HEAD = ['Создано', 'Дата', 'Время', 'Статус', 'Имя', 'Телефон', 'Telegram', 'Услуга', 'Акция', 'Место', 'Размер', 'Идея', 'Референсы', 'Слот'];

/** Запустите один раз вручную, чтобы выдать разрешения и создать лист и папку. */
function setup() {
  getSheet_();
  getFolder_();
  MailApp.getRemainingDailyQuota();
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
