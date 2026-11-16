/**
 * 設定放在「專案設定 → 指令碼屬性」，全部選填：
 *   GIST_ID、GITHUB_TOKEN           同步留言到 GitHub Gist（沒設就由 doGet 直接提供留言）
 *   TELEGRAM_BOT_TOKEN、TELEGRAM_CHAT_ID  有新留言時發 Telegram 通知
 */
const HEADERS = ['留言時間', '留言名稱', '留言網址', '留言內容', '回覆時間', '回覆名稱', '回覆內容', '審核通過'];
const MAX_LENGTH = { name: ['名稱', 50], website: ['網址', 200], text: ['留言', 1000] };

function getConfig() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const get = key => String(props[key] || '').trim();
  return {
    gistId: get('GIST_ID'),
    githubToken: get('GITHUB_TOKEN'),
    telegramBotToken: get('TELEGRAM_BOT_TOKEN'),
    telegramChatId: get('TELEGRAM_CHAT_ID')
  };
}

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function toIsoString(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function formatCell(value) {
  return value instanceof Date ? toIsoString(value) : String(value);
}

function getApprovedMessages() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
    .filter(row => row[0] && row[1] && row[3]
      && (row[7] === true || String(row[7]).trim().toUpperCase() === 'TRUE'))
    .reverse()
    .map(row => ({
      timestamp: formatCell(row[0]),
      name: String(row[1]),
      website: String(row[2]),
      text: String(row[3]),
      replyTime: formatCell(row[4]),
      replyName: String(row[5]),
      reply: String(row[6])
    }));
}

function buildPayload() {
  return {
    success: true,
    last_updated: toIsoString(new Date()),
    messages: getApprovedMessages()
  };
}

/**
 * 讀取已審核留言
 */
function doGet() {
  return jsonOutput(buildPayload());
}

/**
 * 提交留言：JS 送 JSON，無 JS 表單送 x-www-form-urlencoded
 */
function doPost(e) {
  const isForm = !!(e.postData && e.postData.type &&
                    e.postData.type.indexOf('application/x-www-form-urlencoded') === 0);
  try {
    const data = isForm ? e.parameter : JSON.parse(e.postData.contents);
    const entry = validateEntry(data);
    const timestamp = new Date();

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet();
      sheet.appendRow([timestamp, entry.name, entry.website, entry.text, '', '', '', false]);
      sheet.getRange(sheet.getLastRow(), HEADERS.length).insertCheckboxes();
    } finally {
      lock.releaseLock();
    }

    notifyNewMessage(timestamp, entry);

    if (isForm) return htmlResult('留言成功', '留言成功，請等待人工審核，謝謝。');
    return jsonOutput({ success: true, message: '留言已成功提交' });

  } catch (error) {
    const reason = error && error.message ? error.message : String(error);
    if (isForm) return htmlResult('留言失敗', `留言失敗：${reason}，請關掉網頁後再試一次。`);
    return jsonOutput({ success: false, error: reason });
  }
}

function validateEntry(data) {
  const entry = {
    name: String(data.name || '').trim(),
    website: String(data.website || '').trim(),
    text: String(data.text || '').trim()
  };

  if (!entry.name) throw new Error('名稱不能為空');
  if (!entry.text) throw new Error('留言內容不能為空');

  Object.keys(MAX_LENGTH).forEach(key => {
    const [label, max] = MAX_LENGTH[key];
    if (entry[key].length > max) throw new Error(`${label}不能超過 ${max} 字`);
  });

  if (entry.website && !/^https?:\/\/\S+$/i.test(entry.website)) {
    throw new Error('網址需以 http:// 或 https:// 開頭');
  }
  if (Object.values(entry).some(v => /<\s*a[\s>]/i.test(v))) {
    throw new Error('留言不能包含 <a> 標籤');
  }

  return entry;
}

function syncToGist() {
  const config = getConfig();
  if (!config.gistId || !config.githubToken) {
    throw new Error('尚未在指令碼屬性設定 GIST_ID 或 GITHUB_TOKEN');
  }

  const response = UrlFetchApp.fetch('https://api.github.com/gists/' + config.gistId, {
    method: 'patch',
    headers: { Authorization: 'token ' + config.githubToken },
    contentType: 'application/json',
    payload: JSON.stringify({
      files: { 'guestbook.json': { content: JSON.stringify(buildPayload(), null, 2) } }
    }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`GitHub API 回應 ${code}：${response.getContentText().slice(0, 200)}`);
  }
}

function notifyNewMessage(timestamp, entry) {
  const config = getConfig();
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const text = [
    '留言簿更新：' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    '',
    '名稱：' + entry.name + (entry.website ? ` | ${entry.website}` : ''),
    '留言：' + entry.text
  ].join('\n');

  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'post',
      payload: { chat_id: config.telegramChatId, text: text }
    });
  } catch (error) {
    Logger.log('通知失敗：' + error);
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 給無 JavaScript 表單訪客看的結果頁
 */
function htmlResult(title, message) {
  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body { margin: 0; padding: 40px 20px; font-family: sans-serif; line-height: 1.8; color: #333; }',
    'p { max-width: 30em; margin: 0 auto; text-align: center; font-size: 1.1rem; }',
    '</style>',
    '</head>',
    '<body>',
    `<p>${escapeHtml(message)}</p>`,
    '</body>',
    '</html>'
  ].join('\n');

  return HtmlService.createHtmlOutput(html);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💬 留言簿')
    .addItem('初始化工作表', 'setupSheet')
    .addItem('同步留言到 Gist', 'manualSync')
    .addToUi();
}

/**
 * 在 G 欄（回覆內容）輸入時，E 欄（回覆時間）空白就自動填入現在時間
 */
function onEdit(e) {
  const range = e.range;
  if (range.getSheet().getIndex() !== 1 || range.getColumn() !== 7 || range.getRow() < 2 || range.getNumRows() > 1) return;

  const timeCell = range.offset(0, -2);
  if (range.getValue() && !timeCell.getValue()) {
    timeCell.setValue(new Date()).setNumberFormat('yyyy/MM/dd HH:mm:ss');
  }
}

/**
 * 寫入標題列，只在已有留言（A 欄有值）的列放審核核取方塊，H 欄勾選綠底、未勾紅底（不會動到既有留言內容）
 */
function setupSheet() {
  const sheet = getSheet();
  const column = HEADERS.length;
  const rows = sheet.getMaxRows() - 1;
  const approvalRange = sheet.getRange(2, column, rows, 1);

  sheet.getRange(1, 1, 1, column).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  const timestamps = sheet.getRange(2, 1, rows, 1).getValues();
  let count = timestamps.length;
  while (count > 0 && !timestamps[count - 1][0]) count--;

  approvalRange.clearDataValidations();
  if (count < rows) sheet.getRange(count + 2, column, rows - count, 1).clearContent();
  if (count > 0) sheet.getRange(2, column, count, 1).insertCheckboxes();

  const firstCell = sheet.getRange(2, column).getA1Notation();
  const colorRule = (value, color) => SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=UPPER(${firstCell}&"")="${value}"`)
    .setBackground(color)
    .setRanges([approvalRange])
    .build();

  const otherRules = sheet.getConditionalFormatRules()
    .filter(rule => !rule.getRanges().some(range => range.getColumn() === column));
  sheet.setConditionalFormatRules([...otherRules, colorRule('TRUE', '#b7e1cd'), colorRule('FALSE', '#f4c7c3')]);
}

function manualSync() {
  const ui = SpreadsheetApp.getUi();
  try {
    syncToGist();
    ui.alert('✅ 同步成功！', '留言已更新至 GitHub Gist。', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ 同步失敗', '錯誤：' + e.message, ui.ButtonSet.OK);
  }
}
