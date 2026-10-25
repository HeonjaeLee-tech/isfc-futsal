/**
 * ISFC 20주년 풋살대회 · 팀 꾸미기 저장소 (Google Apps Script 웹앱)
 *
 * 사이트의 '팀 꾸미기' 탭에서 팀 이름과 엠블럼 사진을 바꾸면 이 스크립트가 붙어 있는 구글 시트에 저장합니다.
 *  - 팀꾸미기 탭: 지금 적용 중인 팀 이름과 사진. 행을 지우거나 칸을 비우면 원래대로 돌아갑니다.
 *  - 기록 탭: 누가 바꿀 때마다 한 줄씩 쌓입니다. 장난으로 바뀌면 여기서 예전 값을 복사해 되돌리면 됩니다.
 *  - 설정 탭: '잠금' 값을 O로 바꾸면 사이트에서 더 이상 바꿀 수 없습니다.
 *
 * 배포: 배포 → 새 배포 → 유형 '웹 앱' → 실행 사용자 '나' → 액세스 권한 '모든 사용자'
 * 배포 후 나오는 웹 앱 주소(…/exec)를 사이트의 config.js DECO_URL에 넣습니다.
 *
 * @OnlyCurrentDoc
 */
var TEAMS = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'];
var MAX_NAME = 12;      // 팀 이름 최대 글자 수
var MAX_IMG = 48000;    // 시트 칸 하나에 5만 글자까지 들어가므로 여유를 둔다
var IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#741243').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function teamSheet_() {
  var sh = sheet_('팀꾸미기', ['팀코드', '팀이름', '이미지', '바꾼시각']);
  if (sh.getLastRow() < 2) {
    sh.getRange(2, 1, TEAMS.length, 1).setValues(TEAMS.map(function (c) { return [c]; }));
    sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 260); sh.setColumnWidth(4, 160);
  }
  return sh;
}
function settings_() {
  var sh = sheet_('설정', ['항목', '값', '설명']);
  if (sh.getLastRow() < 2) sh.getRange(2, 1, 1, 3).setValues([['잠금', 'X', 'O로 바꾸면 사이트에서 팀 이름과 사진을 더 이상 바꿀 수 없습니다']]);
  var v = {};
  sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 2).getValues().forEach(function (r) { if (r[0]) v[String(r[0]).trim()] = String(r[1]).trim(); });
  return v;
}
function locked_() { return /^(o|ㅇ|y|yes|잠금|true)$/i.test(settings_()['잠금'] || ''); }
function version_() { return PropertiesService.getScriptProperties().getProperty('v') || '0'; }
function bump_() { var v = String(Date.now()); PropertiesService.getScriptProperties().setProperty('v', v); return v; }

function read_() {
  var sh = teamSheet_(), n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  sh.getRange(2, 1, n, 4).getValues().forEach(function (r) {
    var c = String(r[0]).trim().toUpperCase();
    if (TEAMS.indexOf(c) < 0) return;
    var name = String(r[1]).trim(), img = String(r[2]).trim();
    if (!name && !img) return;
    out[c] = { name: name.slice(0, MAX_NAME), img: IMG_RE.test(img) ? img : '', at: r[3] instanceof Date ? r[3].getTime() : 0 };
  });
  return out;
}
function out_(obj, cb) {
  var s = JSON.stringify(obj);
  if (cb && /^[\w$.]+$/.test(cb)) return ContentService.createTextOutput(cb + '(' + s + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

/* 사이트가 읽기: ?v=마지막버전 을 주면 바뀐 게 없을 때 짧게 답한다 */
function doGet(e) {
  var p = (e && e.parameter) || {}, v = version_(), lk = locked_();
  if (p.v && p.v === v) return out_({ ok: true, same: true, v: v, locked: lk }, p.callback);
  return out_({ ok: true, v: v, locked: lk, teams: read_() }, p.callback);
}

/* 사이트가 저장: { team: 'A1', name: '새 이름', img: 'data:image/jpeg;base64,...' }  (img를 빼면 사진은 그대로, ''이면 사진 지움) */
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: '요청을 읽지 못했습니다' }); }
  var code = String(req.team || '').trim().toUpperCase();
  if (TEAMS.indexOf(code) < 0) return out_({ ok: false, error: '팀을 골라 주십시오' });
  if (locked_()) return out_({ ok: false, locked: true, error: '운영진이 팀 꾸미기를 마감했습니다' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return out_({ ok: false, error: '잠시 후 다시 눌러 주십시오' });
  try {
    var sh = teamSheet_(), n = Math.max(1, sh.getLastRow() - 1), codes = sh.getRange(2, 1, n, 1).getValues(), row = -1;
    for (var i = 0; i < codes.length; i++) if (String(codes[i][0]).trim().toUpperCase() === code) { row = i + 2; break; }
    if (row < 0) { row = sh.getLastRow() + 1; sh.getRange(row, 1).setValue(code); }
    var cur = sh.getRange(row, 2, 1, 2).getValues()[0], name = String(cur[0]), img = String(cur[1]);
    if ('name' in req) name = String(req.name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if ('img' in req) {
      var im = String(req.img || '');
      if (im && !IMG_RE.test(im)) return out_({ ok: false, error: '사진 형식이 맞지 않습니다' });
      if (im.length > MAX_IMG) return out_({ ok: false, error: '사진이 너무 큽니다' });
      img = im;
    }
    var safe = /^[=+\-@]/.test(name) ? "'" + name : name; // 수식으로 읽히지 않게
    var now = new Date();
    sh.getRange(row, 2, 1, 3).setValues([[safe, img, now]]);
    sheet_('기록', ['시각', '팀코드', '팀이름', '이미지']).appendRow([now, code, safe, img]);
    var v = bump_();
    return out_({ ok: true, v: v, team: code, data: { name: name, img: img, at: now.getTime() } });
  } finally {
    lock.releaseLock();
  }
}

/* 시트를 손으로 고친 뒤 사이트에 바로 반영하고 싶을 때 한 번 실행 (편집기 위 ▶ 실행) */
function 사이트에_다시_알리기() { bump_(); }

/* 처음 한 번: 탭 만들기 */
function 처음_설정() { teamSheet_(); settings_(); sheet_('기록', ['시각', '팀코드', '팀이름', '이미지']); bump_(); }

/* 시트를 손으로 고치면 버전을 올려 사이트가 다시 읽게 한다 (단순 트리거) */
function onEdit(e) { try { bump_(); } catch (x) { /* 무시 */ } }
