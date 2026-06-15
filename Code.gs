/**
 * DB_From_Respond_CRM — Apps Script
 * ---------------------------------------------------------------------------
 * วัตถุประสงค์ : ดึงข้อมูลจากชีต "raw-respond" (DB01) ไปยังชีต "Filter-raw-respond" (DB02)
 *
 * ตรรกะหลัก :
 *   - จัดกลุ่มตาม respond_id + วันที่ (คอลัมน์ C) แบบไม่ซ้ำ
 *   - แต่ละ respond_id + วันที่ เลือก row ที่ "แสดงล่าสุดของวัน" (Task_ID ใหม่ที่สุดในวันนั้น) เป็นตัวแทน
 *   - คอลัมน์ B และ D–AE ดึงค่าจาก row ตัวแทนนั้น (Match กับ C)
 *   - เรียงผลลัพธ์ตาม Task_ID (วันที่/เวลา) จากเก่า → ใหม่
 *
 * โหมดการดึงข้อมูล :
 *   โหมด 1 : ดึงข้อมูลทั้งหมดจาก DB01 จนถึงปัจจุบัน (สร้างใหม่ทั้งหมด)
 *   โหมด 2 : Manual incremental — ดึงเฉพาะข้อมูลใหม่กว่าล่าสุดใน DB02 แล้วรวมแบบไม่ซ้ำ
 *   โหมด 3 : Trigger อัตโนมัติทุกวัน เวลา 18:00 (Asia/Bangkok)
 * ---------------------------------------------------------------------------
 */

/* ===================== CONFIG ===================== */
const CONFIG = {
  SOURCE_SHEET: 'raw-respond',          // DB01
  TARGET_SHEET: 'Filter-raw-respond',   // DB02
  TIMEZONE: 'Asia/Bangkok',
  // โหมด 1 : null = ไม่จำกัดวันเริ่มต้น (ดึงข้อมูลทั้งหมดจาก DB01)
  MODE1_START_DATE: null,
  TRIGGER_HOUR: 18,              // 18:00 น.

  // คอลัมน์ที่ใช้เป็น "respond_id" (คีย์ dedup) และ "Task_ID" (คีย์เวลา/เรียงลำดับ)
  KEY_RESPOND_ID: 'respond_id',
  KEY_TASK_ID: 'Task_ID',

  // Ads Spreadsheet (From-Facebook Ads-Respon.io)
  ADS_SPREADSHEET_ID: '19yN662iCppjMFJTONgZHpbQH4gOkUtDxUcvqYZyPcKw',
  ADS_SHEET_NAME: 'Raw-data',
  ADS_TIMESTAMP_COL: 'Timestamp',
  ADS_RESPOND_ID_COL: 'respond_id',

  // คอลัมน์ที่ดึงจาก Ads sheet มาเพิ่มใน DB02 (ต่อจาก AE → AF เป็นต้นไป)
  ADS_COLUMNS: [
    'Source',           // AF
    'Sub Source',       // AG
    'Ad campaign ID',   // AH
    'Campaign name',    // AI
    'Ad group ID',      // AJ
    'Ad ID',            // AK
    'Ad name'           // AL
  ],

  /*
   * ลำดับคอลัมน์ผลลัพธ์ใน DB02 (A → AE)
   * ค่าแต่ละตัว = ชื่อ header ที่ตรงกับใน raw-respond (DB01)
   * ถ้าชื่อใน raw-respond ต่างจากนี้ ให้แก้ค่าทางขวาให้ตรง
   */
  OUTPUT_COLUMNS: [
    'Task_ID',                                  // A
    'Account Number',                           // B
    'respond_id',                               // C
    'ระบุวันและเวลาติดต่อ/Contact within',      // D
    'ชื่อลูกค้าบนออนไลน์',                       // E
    'Platform_ID',                              // F
    'Platform',                                 // G
    'Company Name',                             // H
    'ชื่อ - สกุล',                              // I
    'First Name',                               // J
    'Last Name',                                // K
    'Business Phone',                           // L
    'Home Phone',                               // M
    'Email',                                    // N
    'Branch',                                   // O
    'ลูกค้าสอบถามสินค้าและบริการไหน',           // P
    'รายละเอียดที่ลูกค้าสอบถาม',                // Q
    'ผู้ประสานงาน-respond',                     // R
    'สินค้าที่ลงโฆษณา',                         // S
    'Note1',                                    // T
    'Street 1',                                 // U
    'Lead Source',                              // V
    'Owner',                                    // W
    'Product Group',                            // X
    'Product Type',                             // Y
    'Description',                              // Z
    'Product Family',                           // AA
    'Brand',                                    // AB
    'Sub-Sector',                               // AC
    'Lead Gen',                                 // AD
    'Model'                                     // AE
  ]
};

/* ===================== MENU ===================== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Respond CRM')
    .addItem('โหมด 1: ดึงทั้งหมด (ทุกช่วงเวลา)', 'runMode1_Full')
    .addItem('โหมด 2: ดึงเพิ่ม (Manual incremental)', 'runMode2_Incremental')
    .addSeparator()
    .addItem('ตั้ง Trigger รายวัน 18:00', 'installDailyTrigger')
    .addItem('ลบ Trigger รายวัน', 'removeDailyTrigger')
    .addToUi();
}

/* ===================== MODE ENTRY POINTS ===================== */

/** โหมด 1 : ดึงข้อมูลทั้งหมดจาก DB01 จนถึงปัจจุบัน (เขียนทับ DB02) */
function runMode1_Full() {
  const result = buildFilter_({
    startDate: CONFIG.MODE1_START_DATE,
    incremental: false
  });
  notify_('โหมด 1 เสร็จสิ้น', 'เขียนข้อมูล ' + result.rows + ' รายการ (unique respond_id) ลง ' + CONFIG.TARGET_SHEET);
}

/** โหมด 2 : Manual incremental — ดึงเฉพาะที่ใหม่กว่าล่าสุดใน DB02 แล้วรวมแบบไม่ซ้ำ */
function runMode2_Incremental() {
  const result = buildFilter_({
    startDate: CONFIG.MODE1_START_DATE,
    incremental: true
  });
  notify_('โหมด 2 เสร็จสิ้น', 'รวมแล้วทั้งหมด ' + result.rows + ' รายการ (เพิ่มใหม่/อัปเดต ' + result.changed + ')');
}

/** โหมด 3 : เรียกโดย Trigger รายวัน — ใช้ logic แบบ incremental เหมือนโหมด 2 */
function runMode3_Trigger() {
  buildFilter_({
    startDate: CONFIG.MODE1_START_DATE,
    incremental: true
  });
}

/* ===================== CORE ===================== */
/**
 * อ่าน DB01 → เลือก row ล่าสุดต่อ respond_id → เรียงตาม Task_ID → เขียน DB02
 * @param {{startDate: Date, incremental: boolean}} opts
 * @return {{rows:number, changed:number}}
 */
function buildFilter_(opts) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(CONFIG.SOURCE_SHEET);
  if (!src) throw new Error('ไม่พบชีต "' + CONFIG.SOURCE_SHEET + '"');
  let dst = ss.getSheetByName(CONFIG.TARGET_SHEET);
  if (!dst) dst = ss.insertSheet(CONFIG.TARGET_SHEET);

  const data = src.getDataRange().getValues();
  if (data.length < 2) {
    writeOutput_(dst, []);
    return { rows: 0, changed: 0 };
  }

  const header = data[0];
  const colIndex = mapHeaders_(header);

  const idxRespond = requireCol_(colIndex, CONFIG.KEY_RESPOND_ID);
  const idxTask = requireCol_(colIndex, CONFIG.KEY_TASK_ID);

  const now = new Date();

  // โหมด incremental : หา Task_ID ล่าสุดที่มีอยู่ใน DB02 เป็น lower bound
  let lowerBound = opts.startDate;
  let existing = {};
  if (opts.incremental) {
    existing = readExisting_(dst);
    if (existing.maxTask && (!lowerBound || existing.maxTask > lowerBound)) {
      // ดึงตั้งแต่ค่าล่าสุดเดิม (รวมค่าเท่ากันด้วย เผื่อมี record ใหม่ในวินาทีเดียวกัน)
      lowerBound = existing.maxTask;
    }
  }

  // เก็บ row ล่าสุดต่อ respond_id
  const latestByRespond = opts.incremental ? existing.map : {};
  let changed = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const respondId = row[idxRespond];
    if (respondId === '' || respondId === null || respondId === undefined) continue;

    const taskDate = parseDate_(row[idxTask]);
    if (!taskDate) continue;                       // ไม่มีวันที่/เวลา → ข้าม
    if (opts.startDate && taskDate < opts.startDate) continue; // ก่อนวันเริ่มต้น → ข้าม (null = ไม่จำกัด)
    if (taskDate > now) continue;                  // อนาคต → ข้าม

    // key = respond_id + วันที่ → เก็บเฉพาะล่าสุดของแต่ละวันต่อคน
    const dateStr = Utilities.formatDate(taskDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    const key = String(respondId) + '_' + dateStr;
    const prev = latestByRespond[key];
    if (!prev || taskDate >= prev._taskDate) {
      latestByRespond[key] = buildOutputRow_(row, colIndex, taskDate);
      changed++;
    }
  }

  // โหลด Ads map แล้ว enrich แต่ละ row ด้วย Ad ที่ใกล้ที่สุดใน ±7 วัน
  const adsMap = loadAdsMap_();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const output = Object.keys(latestByRespond)
    .map(function (k) {
      const row = latestByRespond[k];
      const respondId = String(row[CONFIG.OUTPUT_COLUMNS.indexOf(CONFIG.KEY_RESPOND_ID)]);
      const taskDate = row._taskDate;
      const candidates = adsMap[respondId] || [];

      // หา Ad ที่ Task_ID อยู่หลัง Ad Timestamp ไม่เกิน 7 วัน (นับจาก Ad เป็นจุดเริ่ม)
      // เลือก Ad ที่อยู่ใกล้ Task_ID ที่สุด (diff น้อยที่สุด)
      let bestAd = null;
      let bestDiff = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const diff = taskDate - candidates[i]._tsDate; // บวก = ติดต่อหลัง Ad
        if (diff >= 0 && diff <= SEVEN_DAYS_MS && diff < bestDiff) {
          bestDiff = diff;
          bestAd = candidates[i];
        }
      }
      bestAd = bestAd || {};
      CONFIG.ADS_COLUMNS.forEach(function (col) {
        row.push(bestAd[col] !== undefined ? bestAd[col] : '');
      });
      return row;
    })
    .sort(function (a, b) { return a._taskDate - b._taskDate; });

  writeOutput_(dst, output);
  return { rows: output.length, changed: changed };
}

/* ===================== HELPERS ===================== */

/** สร้าง map ชื่อ header (trim) → index */
function mapHeaders_(header) {
  const map = {};
  for (let i = 0; i < header.length; i++) {
    const name = String(header[i]).trim();
    if (name !== '' && !(name in map)) map[name] = i;
  }
  return map;
}

function requireCol_(colIndex, name) {
  if (!(name in colIndex)) {
    throw new Error('ไม่พบคอลัมน์ "' + name + '" ในชีต ' + CONFIG.SOURCE_SHEET);
  }
  return colIndex[name];
}

/** สร้าง output row ตามลำดับ OUTPUT_COLUMNS พร้อมแนบ _taskDate ไว้ใช้เรียง/เทียบ */
function buildOutputRow_(srcRow, colIndex, taskDate) {
  const out = [];
  for (let c = 0; c < CONFIG.OUTPUT_COLUMNS.length; c++) {
    const colName = CONFIG.OUTPUT_COLUMNS[c];
    if (colName === CONFIG.KEY_TASK_ID) {
      // แสดง Task_ID เป็นรูปแบบ yyyy-MM-dd HH:mm:ss (เช่น 2024-08-23 08:13:18)
      out.push(Utilities.formatDate(taskDate, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'));
      continue;
    }
    const idx = colIndex[colName];
    out.push(idx === undefined ? '' : srcRow[idx]);
  }
  out._taskDate = taskDate;
  return out;
}

/** เขียนผลลัพธ์ลงชีตปลายทาง (header + data) */
function writeOutput_(dst, rows) {
  const allCols = CONFIG.OUTPUT_COLUMNS.concat(CONFIG.ADS_COLUMNS);
  dst.clearContents();
  dst.getRange(1, 1, 1, allCols.length).setValues([allCols]);
  if (rows.length === 0) return;
  const values = rows.map(function (r) { return r.slice(0, allCols.length); });
  const taskCol = CONFIG.OUTPUT_COLUMNS.indexOf(CONFIG.KEY_TASK_ID);
  if (taskCol > -1) {
    dst.getRange(2, taskCol + 1, values.length, 1).setNumberFormat('@');
  }
  dst.getRange(2, 1, values.length, allCols.length).setValues(values);
}

/** อ่านข้อมูลเดิมใน DB02 → map respond_id+date → row, และหา Task_ID ล่าสุด */
function readExisting_(dst) {
  const result = { map: {}, maxTask: null };
  const lastRow = dst.getLastRow();
  if (lastRow < 2) return result;

  const totalCols = CONFIG.OUTPUT_COLUMNS.length + CONFIG.ADS_COLUMNS.length;
  const values = dst.getRange(2, 1, lastRow - 1, totalCols).getValues();
  const idxRespond = CONFIG.OUTPUT_COLUMNS.indexOf(CONFIG.KEY_RESPOND_ID);
  const idxTask = CONFIG.OUTPUT_COLUMNS.indexOf(CONFIG.KEY_TASK_ID);

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const respondId = row[idxRespond];
    if (respondId === '' || respondId === null || respondId === undefined) continue;
    const taskDate = parseDate_(row[idxTask]);
    if (!taskDate) continue;
    row._taskDate = taskDate;
    const dateStr = Utilities.formatDate(taskDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    const key = String(respondId) + '_' + dateStr;
    result.map[key] = row;
    if (!result.maxTask || taskDate > result.maxTask) result.maxTask = taskDate;
  }
  return result;
}

/** แปลงค่าเป็น Date — รองรับ Date object, ตัวเลข serial, และ string หลายรูปแบบ */
function parseDate_(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    // Google Sheets serial date (วันที่ 0 = 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  if (s === '') return null;

  // ลองรูปแบบ dd/MM/yyyy [HH:mm[:ss]]
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s); // ISO และรูปแบบที่ JS เข้าใจ
  return isNaN(d.getTime()) ? null : d;
}

/**
 * อ่าน Ads sheet แล้วสร้าง map: respond_id → [ { _tsDate, col: value, ... }, ... ]
 * เก็บทุก entry ต่อ respond_id เพื่อให้ค้นหา Ad ที่ใกล้ที่สุดใน ±7 วันได้
 */
function loadAdsMap_() {
  const map = {};
  try {
    const ss = SpreadsheetApp.openById(CONFIG.ADS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.ADS_SHEET_NAME);
    if (!sheet) return map;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return map;

    const header = data[0];
    const colIdx = {};
    for (let i = 0; i < header.length; i++) {
      colIdx[String(header[i]).trim()] = i;
    }
    const tsIdx = colIdx[CONFIG.ADS_TIMESTAMP_COL];
    const ridIdx = colIdx[CONFIG.ADS_RESPOND_ID_COL];
    if (tsIdx === undefined || ridIdx === undefined) return map;

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const respondId = String(row[ridIdx]).trim();
      if (!respondId || respondId === '') continue;
      const tsDate = parseDate_(row[tsIdx]);
      if (!tsDate) continue;

      const entry = { _tsDate: tsDate };
      CONFIG.ADS_COLUMNS.forEach(function (col) {
        entry[col] = colIdx[col] !== undefined ? row[colIdx[col]] : '';
      });
      if (!map[respondId]) map[respondId] = [];
      map[respondId].push(entry);
    }
  } catch (e) {
    Logger.log('loadAdsMap_ error: ' + e.message);
  }
  return map;
}

function notify_(title, msg) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, title, 6);
  } catch (e) { /* เรียกแบบไม่มี UI (trigger) จะข้าม */ }
}

/* ===================== TRIGGER MANAGEMENT ===================== */

/** ตั้ง Trigger รายวัน 18:00 (Asia/Bangkok) เรียก runMode3_Trigger */
function installDailyTrigger() {
  removeDailyTrigger();
  ScriptApp.newTrigger('runMode3_Trigger')
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.TRIGGER_HOUR)
    .inTimezone(CONFIG.TIMEZONE)
    .create();
  notify_('ตั้ง Trigger สำเร็จ', 'ดึงข้อมูลทุกวัน เวลา ' + CONFIG.TRIGGER_HOUR + ':00 (' + CONFIG.TIMEZONE + ')');
}

/** ลบ Trigger ของ runMode3_Trigger ทั้งหมด */
function removeDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runMode3_Trigger') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
