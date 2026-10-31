/* ISFC 20주년 OBYB 풋살대회 · 실시간 안내 사이트
 * 데이터: 구글 시트(gviz CSV, 실패 시 JSONP) → 순위·대진·득점왕은 여기서 계산
 */
(function () {
  'use strict';

  var CFG = Object.assign({ SHEET_ID: '', EVENT_DATE: '2026-10-31', POLL_FAST_SEC: 20, POLL_SLOW_SEC: 120, DEMO_NOW: '', DECO_URL: '', DECO_POLL_SEC: 45 }, window.ISFC_CONFIG || {});
  var DEMO = !String(CFG.SHEET_ID || '').trim();
  var BOOT = Date.now();
  var SHEETS = ['공지', '경기', '득점', '팀', '선수', '기념품', '안주', '뒤풀이', '설정'];
  var FAST = ['공지', '경기', '득점'];
  var SLOW = ['팀', '선수', '기념품', '안주', '뒤풀이', '설정'];
  var TABS = ['info', 'draw', 'match', 'scorers', 'teams', 'deco', 'goods', 'food', 'party'];
  var PER = 5, NUMS = [1, 2, 3, 4, 5];   // 조마다 5팀 (10팀). A1~A5 = 1조~5조, B1~B5 = 6조~10조
  var CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'];
  function jo(c) { return ((c[0] === 'B' ? PER : 0) + (+c.slice(1))) + '조'; }
  var VEST = { 빨강: '#d63a3a', 주황: '#f08a24', 노랑: '#f2c94c', 연두: '#9bd35a', 초록: '#2e8b57', 하늘: '#5bc0eb', 파랑: '#2f6fdb', 남색: '#1f2f6b', 보라: '#7e57c2', 분홍: '#f06fa4', 검정: '#2b2b2b', 흰색: '#f4f4f4', 회색: '#9e9e9e' };

  /* ───────── 작은 도구들 ───────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(n, cls) { return '<svg class="i ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + n + '"></use></svg>'; }
  function t(s) { return String(s == null ? '' : s).trim(); }
  function num(s) { var v = t(s); if (v === '') return null; var n = parseInt(v.replace(/[^\d-]/g, ''), 10); return isNaN(n) ? null : n; }
  function won(n) { return n.toLocaleString('ko-KR') + '원'; }
  var store = {
    get: function (k) { try { return window.localStorage.getItem('isfc:' + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem('isfc:' + k, v); } catch (e) { /* 저장 불가 환경 */ } }
  };

  /* 시간: 모든 경기 시각은 행사 날짜의 한국 시간 기준 */
  function now() { return DEMO && CFG.DEMO_NOW ? Date.parse(CFG.DEMO_NOW) + (Date.now() - BOOT) : Date.now(); }
  function hhmm(s) { // '13:00', '13:00:00', '오후 1:00:00' 모두 13:00으로
    var x = t(s), m = x.match(/(\d{1,2})\s*:\s*(\d{2})/); if (!m) return null;
    var h = +m[1]; if (/오후|pm/i.test(x) && h < 12) h += 12; if (/오전|am/i.test(x) && h === 12) h = 0;
    return (h < 10 ? '0' : '') + h + ':' + m[2];
  }
  function at(s) { var h = hhmm(s); return h ? Date.parse(CFG.EVENT_DATE + 'T' + h + ':00+09:00') : null; }
  function kstDate(ms) { return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
  function isEventDay() { return kstDate(now()) === CFG.EVENT_DATE; }
  function dday() { return Math.round((Date.parse(CFG.EVENT_DATE + 'T00:00:00+09:00') - Date.parse(kstDate(Date.now()) + 'T00:00:00+09:00')) / 864e5); } // D-day는 샘플 모드에서도 실제 날짜 기준

  /* ───────── 시트 읽기 ───────── */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', i = 0, q = false, c;
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
      i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function toObjects(head, rows) {
    head = head.map(t);
    return rows.filter(function (r) {
      var any = false, ex = false;
      r.forEach(function (v) { v = t(v); if (v) any = true; if (v.indexOf('(예시)') === 0) ex = true; });
      return any && !ex;
    }).map(function (r) { var o = {}; head.forEach(function (h, i) { if (h) o[h] = t(r[i]); }); return o; });
  }
  function url(sheet, extra) {
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(t(CFG.SHEET_ID)) + '/gviz/tq?headers=1&sheet=' + encodeURIComponent(sheet) + extra + '&t=' + Date.now();
  }
  function fetchCSV(sheet) {
    return fetch(url(sheet, '&tqx=out:csv'), { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      if (/^\s*</.test(text)) throw new Error('공유 설정 확인 필요');
      var rows = parseCSV(text);
      if (!rows.length) return [];
      return toObjects(rows[0], rows.slice(1));
    });
  }
  function fetchJSONP(sheet) {
    return new Promise(function (resolve, reject) {
      var cb = '__isfc' + Math.random().toString(36).slice(2), s = document.createElement('script');
      var timer = setTimeout(function () { done(); reject(new Error('시간 초과')); }, 12000);
      function done() { clearTimeout(timer); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
      window[cb] = function (resp) {
        done();
        try {
          if (!resp || resp.status === 'error') throw new Error('시트 오류');
          var head = resp.table.cols.map(function (c) { return c.label || ''; });
          var rows = resp.table.rows.map(function (r) { return (r.c || []).map(function (x) { return x ? (x.f != null ? x.f : (x.v != null ? x.v : '')) : ''; }); });
          if (!head.some(Boolean) && rows.length) { head = rows[0]; rows = rows.slice(1); }
          resolve(toObjects(head.map(String), rows));
        } catch (e) { reject(e); }
      };
      s.onerror = function () { done(); reject(new Error('불러오기 실패')); };
      s.src = url(sheet, '&tqx=responseHandler:' + cb);
      document.head.appendChild(s);
    });
  }
  var useJsonp = false;
  function fetchSheet(sheet) {
    if (useJsonp) return fetchJSONP(sheet);
    return fetchCSV(sheet).catch(function () { useJsonp = true; return fetchJSONP(sheet); });
  }

  /* ───────── 상태 ───────── */
  var D = {}; SHEETS.forEach(function (s) { D[s] = []; });
  var M = null;            // 계산된 모델
  var loaded = false, lastOk = 0, failing = false, lastSig = '';
  var prevScores = null, prevNotice = null;
  var ui = {
    tab: 'info', sub: 'schedule', filter: store.get('filter') || 'all', pickMine: false,
    mine: store.get('mine') || '', park: store.get('park') || 'in'
  };

  /* 팀 꾸미기: 팀별 이름·사진 (Apps Script 웹앱에 저장) */
  var DECO = { v: '', teams: {}, locked: false, ok: false };
  (function () { try { var c = JSON.parse(store.get('deco') || 'null'); if (c && c.teams) { DECO.v = c.v || ''; DECO.teams = c.teams; DECO.locked = !!c.locked; } } catch (e) { /* 무시 */ } })();

  /* ───────── 모델 계산 ───────── */
  function build() {
    var settings = {};
    D['설정'].forEach(function (r) { if (r['항목']) settings[r['항목']] = r['값'] || ''; });
    // 조 추첨은 현장에서 진행. 사이트는 명단과 추첨기 그림만 보여 주고, 팀은 선수 시트 + 팀공개로 공개한다
    var drawRoster = drawRosterFrom(settings), dAt = at(drawTimeFrom(settings).start);
    var reveal = /^(o|ㅇ|y|yes|공개|true)$/i.test(t(settings['팀공개']));

    var teams = {};
    D['팀'].forEach(function (r) {
      var code = t(r['팀코드']).toUpperCase();
      if (CODES.indexOf(code) < 0) return;
      teams[code] = { code: code, group: code[0], rawName: t(r['팀명']), color: VEST[t(r['조끼색'])] || null, colorName: t(r['조끼색']), captain: t(r['주장']), motto: t(r['한마디']) };
    });
    ['A', 'B'].forEach(function (g) { for (var i = 1; i <= PER; i++) { var c = g + i; if (!teams[c]) teams[c] = { code: c, group: g, rawName: '', color: null }; } });
    Object.keys(teams).forEach(function (c) {
      var tm = teams[c]; tm.name = reveal && tm.rawName ? tm.rawName : jo(c); if (!reveal) tm.color = null;
      tm.baseName = tm.name;
      var dc = DECO.teams[c]; // 팀 꾸미기에서 바꾼 이름·사진이 시트보다 우선
      if (dc && t(dc.name)) tm.name = t(dc.name);
      tm.img = !!(dc && dc.img);
    });

    var players = D['선수'].filter(function (r) { return t(r['이름']); }).map(function (r) {
      return { name: t(r['이름']), year: t(r['학번']).replace(/학번$/, ''), kind: t(r['구분']).toUpperCase(), team: t(r['팀코드']).toUpperCase(), memo: t(r['메모']) };
    });
    var pBy = {}; players.forEach(function (p) { pBy[p.name] = p; });

    var matches = D['경기'].map(function (r) {
      var st = t(r['상태']);
      return {
        no: num(r['번호']), stage: t(r['단계']), time: hhmm(r['시작']) || t(r['시작']), court: t(r['구장']),
        homeRef: t(r['홈']), awayRef: t(r['원정']), hg: num(r['홈골']), ag: num(r['원정골']),
        pk: (function (v) { var m = t(v).match(/(\d+)\s*[-:]\s*(\d+)/); return m ? [+m[1], +m[2]] : null; })(r['승부차기']),
        status: /진행|live|라이브/i.test(st) ? 'live' : /종료|끝|완료|done/i.test(st) ? 'done' : 'sched',
        memo: t(r['메모'])
      };
    }).filter(function (m) { return m.no != null; }).sort(function (a, b) { return a.no - b.no; });
    var byNo = {}; matches.forEach(function (m) { byNo[m.no] = m; });
    function groupOf(m) { var g = m.stage.match(/^([AB])\s*조/); return g ? g[1] : null; }

    function table(g) {
      var rows = {};
      for (var i = 1; i <= PER; i++) rows[g + i] = { code: g + i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      var gm = matches.filter(function (m) { return groupOf(m) === g; });
      gm.forEach(function (m) {
        if (m.status !== 'done' || m.hg == null || m.ag == null) return;
        var h = rows[m.homeRef.toUpperCase()], a = rows[m.awayRef.toUpperCase()];
        if (!h || !a) return;
        h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
        if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; } else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
      });
      function h2h(x, y) {
        var s = 0;
        gm.forEach(function (m) {
          if (m.status !== 'done' || m.hg == null) return;
          var H = m.homeRef.toUpperCase(), A = m.awayRef.toUpperCase();
          if (H === x && A === y) s += Math.sign(m.hg - m.ag);
          if (H === y && A === x) s += Math.sign(m.ag - m.hg);
        });
        return s;
      }
      var list = Object.keys(rows).map(function (k) { var r = rows[k]; r.gd = r.gf - r.ga; return r; });
      list.sort(function (x, y) { return (y.pts - x.pts) || (y.gd - x.gd) || (y.gf - x.gf) || -h2h(x.code, y.code) || (x.code < y.code ? -1 : 1); });
      var played = gm.filter(function (m) { return m.status === 'done'; }).length;
      return { list: list, complete: gm.length > 0 && played === gm.length, played: played, total: gm.length };
    }
    var S = { A: table('A'), B: table('B') };

    function resolve(ref, depth) {
      ref = t(ref); depth = depth || 0;
      var up = ref.toUpperCase();
      if (teams[up]) return { code: up, label: teams[up].name };
      var m = ref.match(/^([AB])\s*조\s*(\d)\s*위$/);
      if (m) {
        var st = S[m[1]], row = st.list[+m[2] - 1];
        if (st.complete && row) return { code: row.code, label: teams[row.code].name, via: ref };
        return { code: null, label: ref, hint: row && st.played ? teams[row.code].name : null };
      }
      m = ref.match(/^(\d+)\s*경기\s*(승자|패자)$/);
      if (m && depth < 5 && byNo[+m[1]]) {
        var o = outcome(byNo[+m[1]], depth + 1);
        if (o) { var code = m[2] === '승자' ? o.win : o.lose; return { code: code, label: teams[code].name, via: ref }; }
        return { code: null, label: ref };
      }
      return { code: null, label: ref || '미정' };
    }
    function outcome(mm, depth) {
      if (mm.status !== 'done' || mm.hg == null || mm.ag == null) return null;
      var h = resolve(mm.homeRef, depth).code, a = resolve(mm.awayRef, depth).code;
      if (!h || !a) return null;
      var hw;
      if (mm.hg !== mm.ag) hw = mm.hg > mm.ag; else if (mm.pk && mm.pk[0] !== mm.pk[1]) hw = mm.pk[0] > mm.pk[1]; else return null;
      return { win: hw ? h : a, lose: hw ? a : h };
    }
    matches.forEach(function (m) {
      m.group = groupOf(m);
      m.ko = !m.group;
      m.home = resolve(m.homeRef); m.away = resolve(m.awayRef);
      var o = outcome(m, 0); m.win = o ? o.win : null;
      m.at = at(m.time);
    });

    var goals = D['득점'].filter(function (r) { return t(r['선수']); }).map(function (r, i) {
      var p = pBy[t(r['선수'])];
      return { no: num(r['경기번호']), name: t(r['선수']), og: /자책/.test(r['메모'] || ''), memo: t(r['메모']), team: p ? p.team : '', p: p, i: i };
    });
    var tally = {};
    goals.forEach(function (g) {
      if (g.og) return;
      var k = g.name;
      if (!tally[k]) tally[k] = { name: g.name, p: g.p, team: g.team, goals: 0, last: 0 };
      tally[k].goals++; tally[k].last = g.i;
    });
    var scorers = Object.keys(tally).map(function (k) { return tally[k]; }).sort(function (a, b) { return (b.goals - a.goals) || (a.last - b.last); });
    var rank = 0, prev = null;
    scorers.forEach(function (s, i) { if (s.goals !== prev) { rank = i + 1; prev = s.goals; } s.rank = rank; });

    var notices = D['공지'].filter(function (r) { return t(r['내용']) && !/^(x|ㄴ|n|no|숨김)$/i.test(t(r['노출'])); }).map(function (r) {
      var lv = t(r['중요도']); return { time: t(r['시간']), text: t(r['내용']), level: /긴급/.test(lv) ? '긴급' : /중요/.test(lv) ? '중요' : '일반' };
    });

    var party = {}; D['뒤풀이'].forEach(function (r) { if (r['항목']) party[t(r['항목'])] = t(r['내용']); });

    return { settings: settings, reveal: reveal, drawRoster: drawRoster, drawAt: dAt, teams: teams, players: players, pBy: pBy, matches: matches, byNo: byNo, S: S, goals: goals, scorers: scorers, notices: notices, goods: D['기념품'], food: D['안주'], party: party };
  }

  /* ───────── 공통 조각 ───────── */
  function badge(code, size) {
    var tm = code && M.teams[code];
    if (!tm) return '<span class="badge tbd ' + (size || '') + '" aria-hidden="true">?</span>';
    var bg = tm.color, fg = 'var(--ink)';
    if (bg) { var r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16); fg = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1d1a1f' : '#ffffff'; }
    if (tm.img) return '<span class="badge has-img tb-' + code + ' ' + (size || '') + '"' + (bg ? ' style="--vest:' + bg + '"' : '') + ' aria-hidden="true"></span>';
    var style = bg ? ' style="background:' + bg + ';color:' + fg + '"' : '';
    return '<span class="badge ' + (size || '') + '"' + style + ' aria-hidden="true">' + esc(code) + '</span>';
  }
  function side(ref) { return ref.code ? esc(M.teams[ref.code].name) : esc(ref.label); }
  function stageChip(m) { return '<span class="stage' + (m.ko ? ' ko' : '') + '">' + esc(m.stage || '경기') + '</span>'; }
  /* 경기 시계: 시트의 '시작' 시각 + 설정의 경기 시간 기준. 늦게 시작하면 '시작'만 실제 시각으로 고치면 맞춰진다 */
  function durMin(m) {
    var s = M.settings, k = t(s['토너먼트 경기시간']), f;
    if (/결승/.test(m.stage) && (f = k.match(/결승\s*(\d+)/) || t(m.memo).match(/(\d+)\s*분/))) return +f[1];
    var v = (m.ko ? k : t(s['조별리그 경기시간'])).match(/(\d+)/);
    return v ? +v[1] : 12;
  }
  function clockAttr(m) { return m.status === 'live' && m.at ? ' data-clock="' + m.at + '|' + durMin(m) * 60000 + '"' : ''; }
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function tickClocks() {
    var n = now();
    $$('[data-clock]').forEach(function (el) {
      var p = el.dataset.clock.split('|'), at = +p[0], dur = +p[1], e = Math.max(0, n - at), over = e > dur;
      var fmt = el.dataset.fmt || 'min';
      if (fmt === 'min') { el.textContent = (over ? Math.round(dur / 60000) + '+' : Math.floor(e / 60000) + 1) + "'"; }
      else if (fmt === 'clock') {
        $('.clock-t', el).textContent = over ? '+' + mmss(e - dur) : mmss(e);
        $('.clock-sub', el).textContent = over ? '추가시간' : mmss(dur - e) + ' 남음';
        $('.clock-bar i', el).style.width = Math.min(100, e / dur * 100) + '%';
        el.classList.toggle('over', over);
      }
    });
    var nc = $('#nowClock'); // 현재 시각은 샘플 모드에서도 실제 한국 시간
    if (nc) { var d = new Date(Date.now() + 9 * 3600e3), p2 = function (x) { return ('0' + x).slice(-2); }; nc.textContent = p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); }
  }
  function statusChip(m, onBoard) {
    if (m.status === 'live') return '<span class="st st-live">LIVE' + (m.at ? ' <b' + clockAttr(m) + ' data-fmt="min"></b>' : '') + '</span>';
    if (m.status === 'done') return '<span class="st st-done">종료</span>';
    if (isEventDay() && m.at && now() - m.at > 3 * 60000) return '<span class="st st-late">지연</span>';
    return '<span class="st">' + (onBoard ? '다음 경기' : '예정') + '</span>';
  }
  function untilText(m) {
    if (!m.at) return m.time ? m.time + ' 시작' : '시간 미정';
    if (!isEventDay()) return '10/31 ' + m.time + ' 시작';
    var d = m.at - now();
    if (d <= -3 * 60000) return '<b>' + Math.floor(-d / 60000) + '분 지연</b> · 앞 경기가 끝나면 시작합니다';
    if (d <= 0) return '곧 시작';
    var min = Math.ceil(d / 60000);
    return min > 90 ? m.time + ' 시작' : min + '분 후 시작 <span class="muted">(' + m.time + ')</span>';
  }
  function matchGoals(m) {
    var hs = [], as = [];
    M.goals.forEach(function (g) {
      if (g.no !== m.no) return;
      var forHome = g.team && g.team === m.home.code, forAway = g.team && g.team === m.away.code;
      if (g.og) { var tmp = forHome; forHome = forAway; forAway = tmp; }
      var label = esc(g.name) + (g.og ? ' <small>(자책)</small>' : '');
      if (forHome) hs.push(label); else if (forAway) as.push(label); else hs.push(label);
    });
    function squash(list) { var c = {}; var order = []; list.forEach(function (x) { if (!c[x]) { c[x] = 0; order.push(x); } c[x]++; }); return order.map(function (x) { return c[x] > 1 ? x + ' ' + c[x] : x; }).join(', '); }
    if (!hs.length && !as.length) return '';
    return '<div class="m-goals"><div>' + squash(hs) + '</div><div aria-hidden="true"></div><div>' + squash(as) + '</div></div>';
  }

  /* ───────── 공지 배너 ───────── */
  function renderTicker() {
    var el = $('#ticker'), tx = $('#tickerText'), tag = $('#tickerTag');
    var last = M.notices[M.notices.length - 1];
    if (!last) { el.dataset.level = '일반'; tag.textContent = '공지'; tx.textContent = '아직 공지가 없습니다'; tx.classList.remove('run'); return; }
    el.dataset.level = last.level;
    tag.textContent = last.level === '일반' ? (last.time || '공지') : last.level + (last.time ? ' ' + last.time : '');
    var line = esc(last.text);
    tx.classList.remove('run'); tx.innerHTML = line;
    var win = tx.parentElement;
    requestAnimationFrame(function () {
      if (tx.scrollWidth > win.clientWidth + 4 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var w = tx.scrollWidth;
        tx.innerHTML = line + '<span aria-hidden="true" style="padding-left:48px">' + line + '</span>';
        tx.style.setProperty('--dur', Math.max(10, Math.round((w + 48) / 45)) + 's');
        tx.classList.add('run');
      }
    });
    $('#ticker').setAttribute('aria-label', '최신 공지: ' + last.text + '. 공지 전체 보기');
  }
  function noticeItems(list) {
    if (!list.length) return '<li class="empty" style="display:block"><b>아직 공지가 없습니다</b>공지가 올라오면 이곳과 맨 위 배너에 바로 표시됩니다</li>';
    return list.map(function (n) {
      return '<li><time>' + esc(n.time) + '</time><p>' + (n.level !== '일반' ? '<span class="lvl lvl-' + n.level + '">' + n.level + '</span>' : '') + esc(n.text) + '</p></li>';
    }).join('');
  }
  function renderNotices() {
    var rev = M.notices.slice().reverse();
    $('#noticeList').innerHTML = noticeItems(rev.slice(0, 4));
    $('#noticeAll').innerHTML = noticeItems(rev);
  }

  /* ───────── 안내 ───────── */
  function partyRounds() { // 1차/2차 형식과 예전(시간/장소) 형식 모두 지원
    var P = M.party, r = [];
    ['1차', '2차', '3차'].forEach(function (k) {
      if (P[k + ' 장소'] || P[k + ' 시간']) r.push({ key: k, time: P[k + ' 시간'] || '', place: P[k + ' 장소'] || '', addr: P[k + ' 주소'] || '', map: P[k + ' 지도링크'] || '' });
    });
    if (!r.length && (P['장소'] || P['시간'])) r.push({ key: '', time: P['시간'] || '', place: P['장소'] || '', addr: P['주소'] || '', map: P['지도링크'] || '' });
    return r;
  }
  /* 조 추첨 시간: 설정 시트 '조추첨' (예: 12:40~13:00). 예전 '개회식' 칸도 읽는다 */
  function drawTime() { return drawTimeFrom(M.settings); }
  function drawTimeFrom(st) {
    var s = t(st['조추첨'] || st['개회식'] || '12:40~13:00');
    var m = s.match(/(\d{1,2}\s*:\s*\d{2})(?:[^\d]+(\d{1,2}\s*:\s*\d{2}))?/);
    var a = m ? hhmm(m[1]) : '12:40', b = m && m[2] ? hhmm(m[2]) : '';
    return { start: a, end: b, label: b ? a + '~' + b : a };
  }
  function renderHero() {
    var d = dday(), el = $('#heroDday');
    var dd = d > 0 ? 'D-' + d : d === 0 ? 'D-DAY' : '종료';
    el.innerHTML = '<span class="dd">' + dd + '</span>' + (d === 0 ? '오늘입니다! 10월 31일 토요일' : '10월 31일 토요일');
    var hf = $('#heroFirst'), m1 = M.matches.filter(function (m) { return hhmm(m.time); })[0]; if (hf && m1) hf.textContent = '(첫 경기 ' + hhmm(m1.time) + ')';
    var hd = $('#heroDraw b'); if (hd) hd.textContent = drawTime().label.replace('~', ' ~ ') + ' 조 추첨';
    var R = partyRounds(), hp = $('#heroParty');
    if (hp && R.length) {
      hp.innerHTML = esc(hhmm(R[0].time) || R[0].time) + ' ' + esc((R[0].key ? R[0].key + ' ' : '') + (R[0].place || '장소 공지 예정')) +
        R.slice(1).map(function (x) { return ' <span class="muted nowrap">→ ' + esc(x.key + ' ' + (x.place || '공지 예정')) + '</span>'; }).join('');
    }
    var live = M.matches.filter(function (m) { return m.status === 'live'; });
    var box = $('#heroLive');
    if (live.length) {
      box.hidden = false;
      box.innerHTML = '<span class="st st-live">LIVE</span>' + live.slice(0, 2).map(function (m) {
        return '<span>' + esc(m.court) + ' <b>' + (m.hg == null ? 0 : m.hg) + ':' + (m.ag == null ? 0 : m.ag) + '</b></span>';
      }).join('') + '<a class="link-btn" href="#match" data-tab="match" style="margin-left:auto;color:inherit">보기</a>';
    } else box.hidden = true;
  }
  function renderFlow() {
    var ms = M.matches, first = function (f) { for (var i = 0; i < ms.length; i++) if (f(ms[i])) return ms[i]; return null; };
    var g1 = first(function (m) { return !m.ko; }), k1 = first(function (m) { return m.ko; });
    var th = first(function (m) { return /3/.test(m.stage) && /4/.test(m.stage); }), fi = first(function (m) { return /결승/.test(m.stage); });
    var fr1 = first(function (m) { return /친선/.test(m.stage); });
    var dr = drawTime();
    var items = [
      [dr.start, '조 추첨 (팀 제비뽑기)', dr.label + ' · 현장에서 직접 뽑습니다. 13시 이후 도착하시면 임의로 배정됩니다'],
      [g1 && g1.time, '조별리그', 'A조(1~5조) 1구장, B조(6~10조) 2구장 · 팀당 4경기'],
      [k1 && k1.time, '4강', '각 조 1·2위 진출 · 각 조 3위는 친선전'],
      [fr1 && fr1.time, '친선전', 'A조 3위와 B조 3위가 한 경기 더'],
      [th && th.time, '3·4위전', ''],
      [fi && fi.time, '결승', fi && fi.memo ? fi.memo : ''],
      [M.settings['시상식'] || '17:00', '시상식', '1·2·3등, 득점왕']
    ];
    partyRounds().forEach(function (r, i) {
      items.push([r.time || (i ? '이후' : '18:30'), r.key ? r.key + ' 뒤풀이' : '2부 뒤풀이', r.place || '장소는 뒤풀이 탭에서 알려드립니다']);
    });
    items = items.filter(function (x) { return x[0]; });
    var n = now(), ev = isEventDay(), cur = -1;
    if (ev) items.forEach(function (x, i) { var a = at(x[0]); if (a && a <= n) cur = i; });
    $('#flow').innerHTML = items.map(function (x, i) {
      var cls = ev ? (i < cur ? 'done' : i === cur ? 'now' : '') : '';
      var tm = hhmm(x[0]) || x[0];
      return '<li class="' + cls + '"><time class="' + (hhmm(x[0]) ? '' : 'txt') + '">' + esc(tm) + '</time><span>' + esc(x[1]) + (x[2] ? '<small>' + esc(x[2]) + '</small>' : '') + '</span></li>';
    }).join('');
  }

  /* 주차 요금: 15분 미만 무료(같은 게이트), 30분 미만 1,500원, 이후 10분당 500원, 1일 최대 24,000원 */
  function parkingFee(min) {
    if (min < 15) return 0;
    if (min < 30) return 1500;
    return Math.min(24000, 1500 + 500 * Math.ceil((min - 30) / 10));
  }
  function calc() {
    var a = hhmm($('#calcIn').value), b = hhmm($('#calcOut').value);
    var dur = $('#calcDur'), fee = $('#calcFee');
    $$('.tval').forEach(function (v) { v.textContent = hhmm($('#' + v.dataset.for).value) || '--:--'; });
    if (!a || !b) { dur.textContent = '시간을 넣어 주십시오'; fee.textContent = '-'; return; }
    var toMin = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; };
    var m = toMin(b) - toMin(a);
    if (m < 0) { dur.textContent = '나가실 시간이 더 이릅니다'; fee.textContent = '-'; return; }
    var h = Math.floor(m / 60), mm = m % 60;
    dur.textContent = (h ? h + '시간 ' : '') + (mm ? mm + '분 ' : '') + '주차' + (m < 15 ? ' (같은 게이트로 나갈 때)' : '');
    fee.innerHTML = parkingFee(m).toLocaleString('ko-KR') + '<small>원</small>';
    $$('.calc-presets .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.preset === a + ',' + b)); });
  }
  function setPark(mode) {
    ui.park = mode === 'out' ? 'out' : 'in'; store.set('park', ui.park);
    $('#parkIn').hidden = ui.park !== 'in'; $('#parkOut').hidden = ui.park !== 'out';
    $('#segIn').setAttribute('aria-selected', String(ui.park === 'in'));
    $('#segOut').setAttribute('aria-selected', String(ui.park === 'out'));
  }

  /* ───────── 경기: 전광판 ───────── */
  function renderBoard() {
    var courts = [];
    M.matches.forEach(function (m) { if (m.court && courts.indexOf(m.court) < 0) courts.push(m.court); });
    if (!courts.length) courts = ['1구장', '2구장'];
    courts.sort();
    var old = {}; $$('#board [data-court]').forEach(function (el) { old[el.dataset.court] = el.dataset.sig; });
    $('#board').innerHTML = courts.slice(0, 4).map(function (c) {
      var list = M.matches.filter(function (m) { return m.court === c; });
      var live = list.filter(function (m) { return m.status === 'live'; })[0];
      var sched = list.filter(function (m) { return m.status === 'sched'; });
      var done = list.filter(function (m) { return m.status === 'done'; });
      var m = live || sched[0] || done[done.length - 1];
      if (!m) return '<div class="court" data-court="' + esc(c) + '"><div class="court-head"><span class="court-name">' + esc(c) + '</span></div><p class="court-foot">경기 없음</p></div>';
      var nxt = live ? sched[0] : sched[1];
      var score = m.status === 'sched'
        ? '<div class="court-score vs">VS</div>'
        : '<div class="court-score"><span data-n="h">' + (m.hg == null ? 0 : m.hg) + '</span><span class="colon">:</span><span data-n="a">' + (m.ag == null ? 0 : m.ag) + '</span></div>';
      var foot = m.status === 'live' ? (nxt ? '다음 <b>' + esc(nxt.time) + '</b> ' + side(nxt.home) + ' vs ' + side(nxt.away) : '이 구장의 마지막 경기입니다')
        : m.status === 'sched' ? untilText(m)
        : '이 구장 경기가 모두 끝났습니다';
      var sig = m.no + ':' + m.hg + ':' + m.ag;
      return '<div class="court' + (m.status === 'live' ? ' is-live' : '') + '" data-court="' + esc(c) + '" data-sig="' + sig + '" data-prev="' + esc(old[c] || '') + '">' +
        '<div class="court-head"><span class="court-name">' + esc(c) + '</span>' + statusChip(m, true) + '</div>' +
        '<div class="court-stage">#' + m.no + ' ' + esc(m.stage) + (m.status === 'sched' ? '' : ' · ' + esc(m.time) + ' 시작') + '</div>' +
        (m.status === 'live' && m.at ? '<div class="clock"' + clockAttr(m) + ' data-fmt="clock"><div class="clock-row"><span class="clock-t">0:00</span><span class="clock-sub"></span></div><span class="clock-bar"><i></i></span></div>' : '') +
        '<div class="court-team">' + badge(m.home.code) + '<span class="nm">' + side(m.home) + '</span></div>' +
        score +
        '<div class="court-team">' + badge(m.away.code) + '<span class="nm">' + side(m.away) + '</span></div>' +
        '<div class="court-foot">' + foot + '</div></div>';
    }).join('');
    // 점수가 바뀐 숫자만 튀게
    $$('#board .court').forEach(function (el) {
      var p = (el.dataset.prev || '').split(':'), s = (el.dataset.sig || '').split(':');
      if (p[0] && p[0] === s[0]) {
        if (p[1] !== s[1]) { var h = $('[data-n="h"]', el); if (h) h.classList.add('num-pop'); }
        if (p[2] !== s[2]) { var a = $('[data-n="a"]', el); if (a) a.classList.add('num-pop'); }
      }
    });
  }

  /* ───────── 경기: 일정 ───────── */
  function involves(m, code) { return code && (m.home.code === code || m.away.code === code); }
  function renderFilters() {
    var opts = [['all', '전체'], ['mine', '내 팀 경기만']].concat([['1구장', '1구장'], ['2구장', '2구장'], ['A', 'A조'], ['B', 'B조'], ['ko', '토너먼트']]);
    var sel = M.reveal ? '<select class="myteam' + (ui.mine ? ' on' : '') + '" id="mine" aria-label="내 팀 경기 강조"><option value="">내 팀 고르기</option>' +
      CODES.map(function (c) { return '<option value="' + c + '"' + (ui.mine === c ? ' selected' : '') + '>' + c + ' ' + esc(M.teams[c].name) + '</option>'; }).join('') + '</select>' : '';
    $('#filters').innerHTML = sel + opts.map(function (o) { return '<button type="button" class="chip' + (o[0] === 'mine' ? ' chip-mine' : '') + '" data-filter="' + o[0] + '" aria-pressed="' + (ui.filter === o[0]) + '">' + (o[0] === 'mine' ? icon('star-fill') : '') + o[1] + '</button>'; }).join('');
  }
  function matchRow(m) {
    var hw = m.win && m.win === m.home.code, aw = m.win && m.win === m.away.code;
    var score = m.status === 'sched' ? '<div class="m-score vs">' + esc(m.time || 'vs') + '</div>'
      : '<div class="m-score">' + (m.hg == null ? 0 : m.hg) + ' : ' + (m.ag == null ? 0 : m.ag) + (m.pk ? '<span class="m-pk">승부차기 ' + m.pk[0] + '-' + m.pk[1] + '</span>' : '') + '</div>';
    var hint = function (r) { return !r.code && r.hint ? '<small class="muted" style="font-weight:500"> 현재 ' + esc(r.hint) + '</small>' : ''; };
    return '<div class="m' + (m.status === 'live' ? ' is-live' : '') + (involves(m, ui.mine) ? ' is-mine' : '') + '">' +
      '<div class="m-meta"><span>#' + m.no + '</span><span>' + esc(m.court) + '</span>' + stageChip(m) + statusChip(m) + '</div>' +
      '<div class="m-row">' +
        '<div class="m-team home' + (aw ? ' lose' : '') + (m.home.code ? '' : ' tbd') + '"><span class="nm">' + side(m.home) + hint(m.home) + '</span>' + badge(m.home.code) + '</div>' +
        score +
        '<div class="m-team' + (hw ? ' lose' : '') + (m.away.code ? '' : ' tbd') + '">' + badge(m.away.code) + '<span class="nm">' + side(m.away) + hint(m.away) + '</span></div>' +
      '</div>' + matchGoals(m) + (m.memo ? '<div class="m-note">' + esc(m.memo) + '</div>' : '') + '</div>';
  }
  /* 내 팀 경기만 보기: 팀 고르기 화면과 요약 */
  function minePicker() {
    return '<div class="mine-pick"><b>내 팀을 골라 주십시오</b><p>고르신 팀의 경기만 시간 순서대로 보여 드립니다. 이 폰에 기억해 두니 다음에 들어오셔도 그대로입니다.</p>' +
      ['A', 'B'].map(function (g) {
        return '<div class="mine-row"><span class="deco-g">' + g + '조</span><div class="mine-grid">' + NUMS.map(function (i) {
          var c = g + i; return '<button type="button" class="deco-tile" data-mine-set="' + c + '" aria-pressed="' + (ui.mine === c) + '">' + badge(c) + '<span>' + esc(M.teams[c].name) + '</span></button>';
        }).join('') + '</div></div>';
      }).join('') + '</div>';
  }
  function mineSummary(list) {
    var c = ui.mine, tm = M.teams[c], left = list.filter(function (m) { return m.status !== 'done'; });
    var live = list.filter(function (m) { return m.status === 'live'; })[0], nxt = left.filter(function (m) { return m.status === 'sched'; })[0];
    var rec = { w: 0, d: 0, l: 0 };
    list.forEach(function (m) {
      if (m.status !== 'done' || m.hg == null || m.ag == null) return;
      var mine = m.home.code === c ? m.hg : m.ag, opp = m.home.code === c ? m.ag : m.hg;
      if (mine > opp || (mine === opp && m.win === c)) rec.w++; else if (mine < opp || (m.win && m.win !== c)) rec.l++; else rec.d++;
    });
    var played = rec.w + rec.d + rec.l;
    var line = live ? '<b class="mine-live">지금 경기 중 · ' + esc(live.court) + '</b>'
      : nxt ? '다음 경기 <b>' + esc(nxt.time) + ' ' + esc(nxt.court) + '</b>' : '모든 경기를 마쳤습니다';
    return '<div class="mine-sum">' + badge(c, 'lg') +
      '<div class="mine-sum-t"><b>' + esc(tm.name) + '</b><span>' + c + ' · ' + list.length + '경기' + (played ? ' · ' + rec.w + '승 ' + rec.d + '무 ' + rec.l + '패' : '') + '</span><span>' + line + '</span></div>' +
      '<button type="button" class="link-btn" data-mine-change>팀 바꾸기</button></div>';
  }
  function renderSchedule() {
    var f = ui.filter, head = '', foot = '';
    if (f === 'mine' && !M.reveal) {
      $('#schedule').innerHTML = '<div class="mine-pick"><b>조 추첨이 끝나면 열립니다</b><p>' + esc(drawTime().label) + ' 조 추첨으로 팀이 정해지면 이곳에서 내 팀을 고르실 수 있습니다. 고르시면 그 팀 경기만 시간 순서대로 모아서 보여 드립니다.</p></div>';
      return;
    }
    if (f === 'mine') {
      if (!ui.mine || ui.pickMine) { $('#schedule').innerHTML = minePicker(); return; }
      var mineList = M.matches.filter(function (m) { return involves(m, ui.mine); });
      head = mineSummary(mineList);
      var koOpen = M.matches.some(function (m) { return m.ko && (!m.home.code || !m.away.code); });
      if (koOpen) foot = '<p class="fine mine-foot">토너먼트에 오르시면 그 경기도 조별리그가 끝나는 대로 이곳에 자동으로 추가됩니다.</p>';
    }
    var list = M.matches.filter(function (m) {
      if (f === 'all') return true;
      if (f === 'mine') return involves(m, ui.mine);
      if (f === 'ko') return m.ko;
      if (f === 'A' || f === 'B') return m.group === f;
      return m.court === f;
    });
    if (!list.length) { $('#schedule').innerHTML = head + '<div class="empty"><b>보여드릴 경기가 없습니다</b>경기 일정이 올라오면 이곳에 표시됩니다</div>' + foot; return; }
    var slots = [], idx = {};
    list.forEach(function (m) { var k = m.time || '시간 미정'; if (!(k in idx)) { idx[k] = slots.length; slots.push({ time: k, items: [] }); } slots[idx[k]].items.push(m); });
    $('#schedule').innerHTML = head + slots.map(function (s) {
      var ko = s.items.every(function (m) { return m.ko; }), st = s.items.map(function (m) { return m.stage; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');
      return '<div class="slot"><h3 class="slot-time">' + esc(s.time) + '<small>' + esc(ko ? st : '조별리그') + '</small></h3><div class="slot-list">' + s.items.map(matchRow).join('') + '</div></div>';
    }).join('');
  }

  /* ───────── 경기: 순위표 ───────── */
  function renderStandings() {
    $('#standings').innerHTML = ['A', 'B'].map(function (g) {
      var st = M.S[g];
      var rows = st.list.map(function (r, i) {
        var cls = i < 2 ? 'r1' : 'r0';
        return '<tr' + (r.code === ui.mine ? ' style="background:var(--brand-soft)"' : '') + '><td><span class="rank ' + cls + '">' + (i + 1) + '</span></td>' +
          '<td><div class="tcell">' + badge(r.code, 'sm') + '<span class="nm">' + esc(M.teams[r.code].name) + '</span></div></td>' +
          '<td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pts">' + r.pts + '</td></tr>';
      }).join('');
      return '<h3 class="group-title">' + g + '조<small>' + st.played + ' / ' + st.total + ' 경기 종료' + (st.complete ? ' · 순위 확정' : '') + '</small></h3>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">순위</th><th scope="col">팀</th><th scope="col">경기</th><th scope="col">승</th><th scope="col">무</th><th scope="col">패</th><th scope="col">득실</th><th scope="col">승점</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('') + '<div class="tbl-legend"><span><i class="rank r1"></i>4강 진출</span><span>승점 같으면 골득실 → 다득점 → 승자승</span></div>';
  }

  /* ───────── 경기: 대진표 ───────── */
  function bm(m, cls) {
    if (!m) return '<div class="bm ' + (cls || '') + '"><div class="bm-no">미정</div></div>';
    function line(ref, g, win) {
      var lose = m.win && !win;
      return '<div class="bm-t' + (ref.code ? '' : ' tbd') + (lose ? ' lose' : '') + '">' + badge(ref.code, 'sm') + '<span class="nm">' + side(ref) + '</span><b>' + (m.status === 'sched' || g == null ? '' : g) + '</b></div>';
    }
    return '<div class="bm ' + (cls || '') + (m.status === 'live' ? ' is-live' : '') + '"><div class="bm-no"><span>#' + m.no + ' · ' + esc(m.time) + '</span><span>' + (m.status === 'live' ? 'LIVE' : m.status === 'done' ? (m.pk ? 'PK ' + m.pk[0] + '-' + m.pk[1] : '종료') : esc(m.court)) + '</span></div>' +
      line(m.home, m.hg, m.win && m.win === m.home.code) + line(m.away, m.ag, m.win && m.win === m.away.code) + '</div>';
  }
  function renderBracket() {
    var ko = M.matches.filter(function (m) { return m.ko; });
    var r1 = ko.filter(function (m) { return /진출/.test(m.stage); });
    var sf = ko.filter(function (m) { return /4\s*강/.test(m.stage) && !/진출/.test(m.stage); });
    var th = ko.filter(function (m) { return /3/.test(m.stage) && /4/.test(m.stage) && /위/.test(m.stage); })[0];
    var fi = ko.filter(function (m) { return /결승/.test(m.stage); })[0];
    var fr = ko.filter(function (m) { return /친선/.test(m.stage); });
    var lose = fi && fi.win ? (fi.win === fi.home.code ? fi.away.code : fi.home.code) : null, third = th && th.win;
    var top = fi && fi.win
      ? '<small>우승</small><b>' + esc(M.teams[fi.win].name) + '</b><span>준우승 ' + esc(M.teams[lose].name) + (third ? ' · 3위 ' + esc(M.teams[third].name) : '') + '</span>'
      : '<small>정상에 오를 팀은?</small><b>' + (fi ? esc(fi.time) + ' 결승' : '결승') + '</b>';
    var on = function (m) { return m && m.win ? ' on' : ''; };
    $('#bracket').innerHTML =
      '<div class="vb' + (fi && fi.win ? ' crowned' : '') + '">' +
        '<div class="vb-top"><div class="vb-cup">' + icon('trophy-fill') + '</div><div class="vb-champ">' + top + '</div></div>' +
        '<div class="vb-stem' + on(fi) + '"></div>' +
        '<div class="vb-lab"><span>결승</span></div>' +
        '<div class="vb-one">' + bm(fi, 'final') + '</div>' +
        '<div class="vb-fork"><i class="l' + on(sf[0]) + '"></i><i class="r' + on(sf[1]) + '"></i><b class="' + (on(sf[0]) || on(sf[1]) ? 'on' : '') + '"></b></div>' +
        '<div class="vb-lab"><span>4강</span></div>' +
        '<div class="vb-two">' + bm(sf[0]) + bm(sf[1]) + '</div>' +
        (r1.length ? '<div class="vb-legs"><i class="' + on(r1[0]) + '"></i><i class="' + on(r1[1]) + '"></i></div>' +
          '<div class="vb-lab"><span>4강 진출전</span></div>' + '<div class="vb-two">' + bm(r1[0]) + bm(r1[1]) + '</div>' : '') +
        '<p class="vb-note">' + icon('arrow-right') + '아래에서 위로 올라갑니다. 4강은 각 조 1위와 상대 조 2위가 맞붙습니다.</p>' +
      '</div>' +
      '<div class="third"><div class="br-head">3·4위전</div>' + bm(th) + '</div>' +
      (fr.length ? '<div class="third fr"><div class="br-head">친선전</div><div class="fr-list">' + fr.map(function (m) { return bm(m); }).join('') + '</div></div>' : '') +
      '<p class="fine">조별리그가 끝나면 "A조 2위" 같은 자리에 실제 팀이 자동으로 들어갑니다.</p>';
  }

  /* ───────── 경기: 진행 방식 ───────── */
  function renderRules() {
    var s = M.settings;
    $('#rules').innerHTML =
      '<ol class="steps">' +
        '<li><div><b>팀 정하기</b><p>' + esc(drawTime().label) + ' 풋살장에서 직접 제비뽑기로 10팀을 정합니다. 13시 이후에 도착하시는 분들은 남은 자리에 임의로 배정해 드립니다. 정해지는 대로 이 사이트에도 공개합니다.</p></div></li>' +
        '<li><div><b>조별 풀리그</b><p>A조(1~5조)는 1구장, B조(6~10조)는 2구장에서 같은 조의 모든 팀과 한 번씩, 팀당 4경기를 치릅니다. 15분마다 한 경기씩이고 연달아 뛰는 팀은 없습니다. 경기 시간은 ' + esc(s['조별리그 경기시간'] || '12분') + '입니다.</p></div></li>' +
        '<li><div><b>4강</b><p>각 조 1·2위가 4강에 오릅니다. A조 1위와 B조 2위, B조 1위와 A조 2위가 맞붙습니다. 각 조 3위 두 팀은 친선전을 한 경기 더 치릅니다. 경기 시간은 ' + esc(s['토너먼트 경기시간'] || '12분') + '입니다.</p></div></li>' +
        '<li><div><b>결승과 3·4위전</b><p>토너먼트에서 비기면 ' + esc(s['토너먼트 무승부'] || '승부차기') + '로 승부를 가립니다.</p></div></li>' +
      '</ol>' +
      '<h3 class="h3">조 순위 정하는 방법</h3>' +
      '<div class="order"><span class="chip">승점 (승 3 · 무 1 · 패 0)</span>' + icon('caret-right') + '<span class="chip">골득실</span>' + icon('caret-right') + '<span class="chip">다득점</span>' + icon('caret-right') + '<span class="chip">승자승</span></div>' +
      '<p class="quote">승패와 상관없이 최대한 많은 경기를 뛰실 수 있도록 진행합니다.</p>';
  }

  /* ───────── 득점왕 ───────── */
  function who(s) {
    var p = s.p, tm = s.team && M.teams[s.team];
    var meta = [];
    if (p && p.year) meta.push(esc(p.year) + '학번');
    if (tm) meta.push(esc(tm.name));
    return { name: esc(s.name), kind: p && p.kind ? '<span class="ob' + (p.kind === 'YB' ? ' yb' : '') + '">' + esc(p.kind) + '</span>' : '', meta: meta.join(' · ') };
  }
  function renderScorers() {
    var L = M.scorers;
    if (!L.length) { $('#scorers').innerHTML = '<div class="empty"><b>아직 골이 없습니다</b>첫 골의 주인공을 기다리고 있습니다. 골이 기록되면 바로 순위가 표시됩니다</div>'; return; }
    var top = L.slice(0, 3), order = [1, 0, 2];
    var pod = '<div class="podium">' + order.map(function (i) {
      var s = top[i]; if (!s) return '<div></div>';
      var w = who(s);
      return '<div class="pod p' + (i + 1) + '">' + (i === 0 ? icon('crown-simple-fill', 'crown') : '<span class="pod-rank">' + s.rank + '위</span>') +
        '<div class="pod-who"><span class="pod-name">' + w.name + '</span><span class="pod-meta">' + w.kind + ' ' + w.meta + '</span></div>' +
        '<div class="pod-block"><b>' + s.goals + '</b><small>골</small></div></div>';
    }).join('') + '</div>';
    var rest = L.slice(3, 20).map(function (s) {
      var w = who(s);
      return '<li><span class="r">' + s.rank + '</span>' + badge(s.team, 'sm') + '<span class="who"><b>' + w.name + ' ' + w.kind + '</b><small>' + w.meta + '</small></span><span class="g">' + s.goals + '</span></li>';
    }).join('');
    var feed = M.goals.slice(-6).reverse().map(function (g) {
      var m = M.byNo[g.no];
      return '<li>' + icon('soccer-ball') + '<span><b>' + esc(g.name) + '</b>' + (g.og ? ' (자책)' : '') + (g.team ? ' <span class="muted">' + esc(M.teams[g.team] ? M.teams[g.team].name : g.team) + '</span>' : '') + '</span><small>' + (m ? '#' + m.no + ' ' + esc(m.court) : '') + '</small></li>';
    }).join('');
    $('#scorers').innerHTML = pod + (rest ? '<ul class="lb">' + rest + '</ul>' : '') + '<h3 class="h3">방금 들어간 골</h3><ul class="feed">' + feed + '</ul>';
  }

  /* ───────── 팀 ───────── */
  function renderTeams() {
    if (!M.reveal) {
      var dr = drawTime(), open = at(dr.start), left = open ? open - now() : 0;
      var cd = '';
      if (left > 0) { var dd = Math.floor(left / 864e5), hh = Math.floor(left % 864e5 / 36e5), mi = Math.floor(left % 36e5 / 6e4); cd = '<div class="cd">' + (dd ? dd + '일 ' : '') + hh + '시간 ' + mi + '분</div><p>조 추첨까지 남은 시간</p>'; }
      $('#teams').innerHTML = '<div class="locked">' + icon('lock-simple') + '<h3>팀은 당일 제비뽑기로 정합니다</h3><p>' + esc(dr.label) + ' 풋살장에서 직접 제비뽑기로 10팀을 정해 A조와 B조로 나눕니다. 13시 이후에 도착하시는 분들은 남은 자리에 임의로 배정해 드립니다. 정해지는 대로 이곳에 공개합니다.' + (CFG.DECO_URL ? ' 팀이 정해지면 <a href="#deco" data-tab="deco" style="color:inherit;font-weight:700">팀 꾸미기</a>에서 이름과 엠블럼을 직접 정하실 수 있습니다.' : '') + '</p>' + cd + '</div>';
      return;
    }
    var html = ['A', 'B'].map(function (g) {
      var st = M.S[g], recBy = {}; st.list.forEach(function (r, i) { recBy[r.code] = { r: r, pos: i + 1 }; });
      var cards = NUMS.map(function (i) {
        var c = g + i, tm = M.teams[c], rec = recBy[c];
        var roster = M.players.filter(function (p) { return p.team === c; });
        var nxt = M.matches.filter(function (m) { return m.status !== 'done' && involves(m, c); })[0];
        var vs = nxt ? (nxt.home.code === c ? nxt.away : nxt.home) : null;
        return '<article class="team' + (ui.mine === c ? ' is-mine' : '') + '">' +
          '<div class="team-head">' + badge(c, 'lg') + '<div><div class="team-name">' + esc(tm.name) + '</div>' +
          '<div class="team-rec">' + esc(c) + (tm.colorName ? ' · ' + esc(tm.colorName) + ' 조끼' : '') + ' · ' + (rec && rec.r.p ? rec.r.w + '승 ' + rec.r.d + '무 ' + rec.r.l + '패, ' + rec.r.gf + '골 · ' + g + '조 ' + rec.pos + '위' : '아직 경기 전') + '</div></div>' +
          (CFG.DECO_URL ? '<a class="team-deco" href="#deco" data-tab="deco" data-deco-pick="' + c + '" aria-label="' + esc(tm.name) + ' 꾸미기">' + icon('pencil-simple') + '</a>' : '') + '</div>' +
          (tm.motto ? '<p class="team-motto">' + esc(tm.motto) + '</p>' : '') +
          (roster.length ? '<div class="roster">' + roster.map(function (p) {
            var cap = (tm.captain && tm.captain === p.name) || /주장/.test(p.memo);
            return '<span class="' + (cap ? 'cap' : '') + '">' + (cap ? icon('crown-simple-fill') : '') + esc(p.name) + (p.year ? ' <small>' + esc(p.year) + '</small>' : '') + (p.kind ? '<span class="ob' + (p.kind === 'YB' ? ' yb' : '') + '" style="border:0;padding:1px 6px">' + esc(p.kind) + '</span>' : '') + '</span>';
          }).join('') + '</div>' : '<p class="muted" style="margin:0;font-size:13px">선수 명단을 준비하고 있습니다</p>') +
          (nxt ? '<div class="team-next">' + icon('clock') + '다음 경기 <b>' + esc(nxt.time) + ' ' + esc(nxt.court) + '</b> vs ' + side(vs) + '</div>' : '') +
          '</article>';
      }).join('');
      return '<h3 class="group-title">' + g + '조</h3><div class="teams">' + cards + '</div>';
    }).join('');
    $('#teams').innerHTML = html;
  }

  /* ───────── 팀 꾸미기 ───────── */
  // dz.name: null이면 입력칸을 아직 안 건드림 / dz.img: undefined=사진 그대로, ''=지우기, 'data:...'=새 사진 / dz.src: 고른 원본(맞춤 방식 바꿀 때 다시 그림)
  var dz = { team: store.get('decoTeam') || '', name: null, img: undefined, src: null, fit: 'cover', busy: false, msg: '', kind: '' };
  var decoCssSig = null, decoTimer = null, decoBusy = false;
  function decoCss() {
    var sig = CODES.map(function (c) { var d = DECO.teams[c]; return d && d.img ? c + d.img.length + d.img.slice(-12) : ''; }).join(',');
    if (sig === decoCssSig) return;
    decoCssSig = sig;
    var el = document.getElementById('decoCss');
    if (!el) { el = document.createElement('style'); el.id = 'decoCss'; document.head.appendChild(el); }
    el.textContent = CODES.map(function (c) { var d = DECO.teams[c]; return d && d.img ? '.tb-' + c + '{background-image:url("' + d.img + '")}' : ''; }).join('\n');
  }
  function applyDeco() { decoCss(); if (M) renderAll(); }
  function saveDecoCache() { store.set('deco', JSON.stringify({ v: DECO.v, teams: DECO.teams, locked: DECO.locked })); }
  function decoJsonp(u) {
    return new Promise(function (resolve, reject) {
      var cb = '__isfcd' + Math.random().toString(36).slice(2), s = document.createElement('script');
      var timer = setTimeout(function () { done(); reject(new Error('시간 초과')); }, 15000);
      function done() { clearTimeout(timer); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
      window[cb] = function (d) { done(); resolve(d); };
      s.onerror = function () { done(); reject(new Error('불러오기 실패')); };
      s.src = u + '&callback=' + cb; document.head.appendChild(s);
    });
  }
  function fetchDeco() {
    if (!CFG.DECO_URL || decoBusy) return Promise.resolve();
    decoBusy = true;
    var u = CFG.DECO_URL + (CFG.DECO_URL.indexOf('?') < 0 ? '?' : '&') + 'v=' + encodeURIComponent(DECO.v || '') + '&t=' + Date.now();
    return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { return decoJsonp(u); })
      .then(function (d) {
        if (!d || !d.ok) return;
        var changed = !DECO.ok;
        DECO.ok = true;
        if (!!d.locked !== DECO.locked) { DECO.locked = !!d.locked; changed = true; }
        if (!d.same && d.teams) { DECO.teams = d.teams; DECO.v = String(d.v || ''); changed = true; }
        if (changed) { saveDecoCache(); applyDeco(); }
      }, function () { /* 다음 차례에 다시 */ })
      .then(function () { decoBusy = false; });
  }
  function scheduleDeco() {
    clearTimeout(decoTimer);
    if (!CFG.DECO_URL || document.hidden) return;
    decoTimer = setTimeout(function () { fetchDeco().then(scheduleDeco); }, CFG.DECO_POLL_SEC * 1000);
  }
  function agoMs(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return s < 60 ? '방금' : s < 3600 ? Math.floor(s / 60) + '분 전' : s < 86400 ? Math.floor(s / 3600) + '시간 전' : Math.floor(s / 86400) + '일 전';
  }
  function decoTeam() { if (CODES.indexOf(dz.team) < 0) dz.team = CODES.indexOf(ui.mine) >= 0 ? ui.mine : 'A1'; return dz.team; }
  function pickDecoTeam(c) {
    if (CODES.indexOf(c) < 0) return;
    if (dz.team !== c) { dz = { team: c, name: null, img: undefined, src: null, fit: 'cover', busy: false, msg: '', kind: '' }; store.set('decoTeam', c); }
  }
  function renderDeco(full) {
    var box = $('#deco'); if (!box || !M) return;
    if (!CFG.DECO_URL) { box.innerHTML = '<div class="empty"><b>팀 꾸미기를 준비하고 있습니다</b>곧 열어 드리겠습니다</div>'; return; }
    var c = decoTeam();
    if (full || !$('#decoForm', box)) {
      box.innerHTML =
        '<div class="deco-locked" id="decoLocked" hidden>' + icon('lock-simple') + '<span>운영진이 팀 꾸미기를 마감했습니다. 지금 모습 그대로 경기를 진행합니다.</span></div>' +
        '<div class="deco-pick" role="radiogroup" aria-label="꾸밀 팀 고르기">' + ['A', 'B'].map(function (g) {
          return '<div class="deco-row"><span class="deco-g">' + g + '조</span><div class="deco-tiles">' + NUMS.map(function (i) { return '<button type="button" class="deco-tile" role="radio" data-deco-team="' + g + i + '"></button>'; }).join('') + '</div></div>';
        }).join('') + '</div>' +
        '<form class="deco-card" id="decoForm" autocomplete="off" novalidate>' +
          '<div class="deco-top">' +
            '<div class="deco-avatar" id="decoAvatar" aria-hidden="true"></div>' +
            '<div class="deco-meta">' +
              '<div class="deco-code" id="decoCode"></div>' +
              '<div class="deco-photo-btns">' +
                '<label class="btn btn-ghost sm deco-file" for="decoFile">' + icon('image') + '사진 고르기</label>' +
                '<input type="file" id="decoFile" accept="image/*" class="sr-file">' +
                '<button type="button" class="link-btn deco-clear" id="decoClear">' + icon('trash') + '사진 지우기</button>' +
              '</div>' +
              '<div class="deco-fit" id="decoFit" role="group" aria-label="사진 맞춤"><button type="button" class="chip" data-fit="cover">꽉 채우기</button><button type="button" class="chip" data-fit="contain">전체 보이기</button></div>' +
            '</div>' +
          '</div>' +
          '<label class="deco-name" for="decoName"><span>팀 이름 <small id="decoCount"></small></span><input id="decoName" type="text" maxlength="12" enterkeyhint="done" autocapitalize="off" spellcheck="false"></label>' +
          '<div class="deco-prev" id="decoPrev"></div>' +
          '<button type="submit" class="btn btn-primary deco-save" id="decoSave">' + icon('check') + '저장하기</button>' +
          '<p class="deco-msg" id="decoMsg" role="status" aria-live="polite"></p>' +
        '</form>' +
        '<p class="fine">링크가 있으면 누구나 바꾸실 수 있습니다. 바꾼 기록은 모두 남아 있으니 서로의 팀은 아껴 주십시오. 이름을 비우고 저장하시면 원래 이름으로 돌아갑니다.</p>';
      $('#decoName').value = dz.name != null ? dz.name : t(DECO.teams[c] && DECO.teams[c].name);
    }
    updateDeco();
  }
  function updateDeco() {
    if (!$('#decoForm')) return;
    var c = dz.team, tm = M.teams[c], d = DECO.teams[c] || {};
    $$('.deco-tile').forEach(function (b) {
      var k = b.dataset.decoTeam;
      b.setAttribute('aria-checked', String(k === c));
      b.innerHTML = badge(k) + '<span>' + esc(M.teams[k].name) + '</span>';
    });
    var img = dz.img !== undefined ? dz.img : (d.img || '');
    var av = $('#decoAvatar');
    av.classList.toggle('has-img', !!img);
    av.style.backgroundImage = img ? 'url("' + img + '")' : '';
    av.style.backgroundColor = img ? '' : (tm.color || '');
    av.style.color = img ? '' : (tm.color ? badgeInk(tm.color) : '');
    av.style.setProperty('--vest', tm.color || 'transparent');
    av.textContent = img ? '' : c;
    $('#decoCode').innerHTML = '<b>' + c + '</b>' + (tm.colorName ? ' · ' + esc(tm.colorName) + ' 조끼' : '') + (d.at ? '<small>마지막 수정 ' + agoMs(d.at) + '</small>' : '');
    $('#decoClear').hidden = !img;
    $('#decoFit').hidden = !dz.src || !img;
    $$('#decoFit [data-fit]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fit === dz.fit)); });
    var inp = $('#decoName'); inp.placeholder = tm.baseName;
    $('#decoCount').textContent = inp.value.length + ' / 12';
    var nm = t(inp.value) || tm.baseName;
    var nxt = M.matches.filter(function (m) { return m.status !== 'done' && involves(m, c); })[0];
    var opp = nxt ? (nxt.home.code === c ? nxt.away.code : nxt.home.code) : null;
    if (!opp) opp = c === 'A1' ? 'A2' : 'A1';
    var me = img ? '<span class="badge lg has-img" style="background-image:url(&quot;' + img + '&quot;)' + (tm.color ? ';--vest:' + tm.color : '') + '" aria-hidden="true"></span>' : badge(c, 'lg');
    $('#decoPrev').innerHTML = '<span class="deco-prev-label">경기 화면에서는 이렇게 보입니다</span>' +
      '<div class="deco-prev-row"><div class="deco-prev-team">' + me + '<span>' + esc(nm) + '</span></div><span class="deco-prev-vs">VS</span>' +
      '<div class="deco-prev-team r">' + badge(opp, 'lg') + '<span>' + esc(M.teams[opp].name) + '</span></div></div>';
    var dirty = dz.img !== undefined || (dz.name != null && t(dz.name) !== t(d.name));
    var lk = DECO.locked;
    $('#decoLocked').hidden = !lk;
    $$('#decoForm input, #decoForm button').forEach(function (x) { x.disabled = lk || dz.busy; });
    $('#decoForm').classList.toggle('is-locked', lk);
    $('#decoSave').disabled = lk || dz.busy || !dirty;
    $('#decoSave').innerHTML = dz.busy ? '<span class="spin" aria-hidden="true"></span>저장하고 있습니다' : icon('check') + '저장하기';
    var msg = $('#decoMsg'); msg.textContent = dz.msg; msg.className = 'deco-msg' + (dz.kind ? ' ' + dz.kind : '');
  }
  function badgeInk(hex) { var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1d1a1f' : '#ffffff'; }
  /* 고른 사진을 정사각형 320px JPEG로 줄인다 (시트 칸 하나에 들어가게 46,000자 이하) */
  function loadPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('사진 파일을 골라 주십시오')); return; }
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); resolve(im); };
      im.onerror = function () { URL.revokeObjectURL(u); reject(new Error('이 사진은 열 수 없습니다. 다른 사진을 골라 주십시오')); };
      im.src = u;
    });
  }
  function squarePhoto(im, fit) {
    var S = 320, cv = document.createElement('canvas'); cv.width = cv.height = S;
    var x = cv.getContext('2d'), w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    var k = fit === 'contain' ? Math.min(S / w, S / h) * 0.92 : Math.max(S / w, S / h);
    var dw = w * k, dh = h * k;
    x.imageSmoothingQuality = 'high';
    x.drawImage(im, (S - dw) / 2, (S - dh) / 2, dw, dh);
    var q = 0.86, out = cv.toDataURL('image/jpeg', q);
    while (out.length > 46000 && q > 0.45) { q -= 0.08; out = cv.toDataURL('image/jpeg', q); }
    if (out.length > 46000) { var c2 = document.createElement('canvas'); c2.width = c2.height = 200; c2.getContext('2d').drawImage(cv, 0, 0, 200, 200); out = c2.toDataURL('image/jpeg', 0.7); }
    return out;
  }
  function decoMsg(text, kind) { dz.msg = text; dz.kind = kind || ''; }
  function saveDeco() {
    if (dz.busy || DECO.locked || !CFG.DECO_URL) return;
    var c = dz.team, body = { team: c, name: t($('#decoName').value) };
    if (dz.img !== undefined) body.img = dz.img;
    dz.busy = true; decoMsg('', ''); updateDeco();
    fetch(CFG.DECO_URL, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { if (d && d.locked) DECO.locked = true; var er = new Error((d && d.error) || '저장하지 못했습니다'); er.server = true; throw er; }
        DECO.teams[c] = d.data; DECO.v = String(d.v || DECO.v); DECO.ok = true; saveDecoCache();
        dz = { team: c, name: null, img: undefined, src: null, fit: 'cover', busy: false, msg: '저장했습니다. 경기 화면에 바로 반영됩니다.', kind: 'ok' };
        decoCss(); renderAll(); renderDeco(true);
        toast(icon('check') + '<span>' + esc(M.teams[c].name) + ' · 팀 꾸미기를 저장했습니다</span>');
      })
      .catch(function (e) {
        dz.busy = false;
        decoMsg(e && e.server ? e.message : '저장하지 못했습니다. 인터넷 연결을 확인하시고 다시 눌러 주십시오.', 'err');
        updateDeco();
      });
  }

  /* ───────── 조 추첨 ─────────
   * 조 추첨은 현장에서 직접 뽑는다. 사이트는 이름 공이 굴러가는 추첨기 그림과 참가자 명단을 보여 주고,
   * 운영진이 선수 시트에 팀코드를 넣고 팀공개를 O로 바꾸면 팀별 명단을 보여 준다. */
  var DD = window.ISFC_DRAW || { names: [] };
  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function nameList(s) { return t(s).split(/[\s,，、\/·]+/).map(t).filter(Boolean); }
  function drawRosterFrom(st) {
    var ex = nameList(st['추첨 제외']), add = nameList(st['추첨 추가']), seen = {}, list = [];
    DD.names.forEach(function (p) { if (ex.indexOf(p[0]) < 0 && !seen[p[0]]) { seen[p[0]] = 1; list.push({ n: p[0], kind: p[1] || '' }); } });
    add.forEach(function (n) { if (ex.indexOf(n) < 0 && !seen[n]) { seen[n] = 1; list.push({ n: n, kind: '' }); } });
    list.sort(function (a, b) { return a.n < b.n ? -1 : a.n > b.n ? 1 : 0; });
    return list;
  }

  /* 추첨기: 이름이 적힌 공이 유리 통 안에서 굴러다닌다 */
  var BALLC = [['#741243', '#ffffff'], ['#A35E88', '#ffffff'], ['#BEE0A9', '#1d2a17'], ['#F2C14E', '#2a2000'], ['#F4EFE6', '#2b2329'], ['#3a2f3e', '#f4efe6']];
  function mixHex(hex, to, k) {
    var a = parseInt(hex.slice(1), 16), b = to === 'w' ? 255 : 0;
    var r = (a >> 16) & 255, g = (a >> 8) & 255, bl = a & 255;
    return 'rgb(' + Math.round(r + (b - r) * k) + ',' + Math.round(g + (b - g) * k) + ',' + Math.round(bl + (b - bl) * k) + ')';
  }
  function Machine(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.balls = []; this.outs = []; this.sparks = []; this.m = 'idle'; this.raf = 0; this.t = 0; this.last = 0; this.w = 0;
    this.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.sprites = {}; this.resize();
  }
  Machine.prototype.resize = function () {
    var w = this.cv.clientWidth || 320; if (w === this.w) return;
    var h = Math.round(w * 0.92), d = Math.min(window.devicePixelRatio || 1, 2), ow = this.w, ocx = this.cx, ocy = this.cy, oR = this.R;
    this.cv.width = Math.round(w * d); this.cv.height = Math.round(h * d); this.cv.style.height = h + 'px';
    this.w = w; this.h = h; this.d = d; this.cx = w / 2; this.cy = h * 0.53; this.R = Math.min(w * 0.43, h * 0.43);
    this.rb = Math.max(11, Math.min(18, this.R * 0.1)); this.sprites = {};
    var self = this;
    this.balls.forEach(function (b) { if (ow) { b.x = self.cx + (b.x - ocx) * self.R / oR; b.y = self.cy + (b.y - ocy) * self.R / oR; } else self.place(b); });
  };
  Machine.prototype.place = function (b) { var a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (this.R - this.rb) * 0.85; b.x = this.cx + Math.cos(a) * r; b.y = this.cy + Math.sin(a) * r; };
  Machine.prototype.sync = function (names) {
    var want = {}, have = {}, self = this;
    names.forEach(function (n) { want[n] = 1; });
    this.balls = this.balls.filter(function (b) { return want[b.n]; });
    this.balls.forEach(function (b) { have[b.n] = 1; });
    names.forEach(function (n) { if (!have[n]) { var b = { n: n, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, c: BALLC[fnv(n) % BALLC.length], rot: Math.random() * 6.283 }; self.place(b); self.balls.push(b); } });
  };
  Machine.prototype.pick = function (n) {
    for (var i = 0; i < this.balls.length; i++) if (this.balls[i].n === n) { var b = this.balls.splice(i, 1)[0]; b.t = 0; b.sx = b.x; b.sy = b.y; this.outs.push(b); return; }
  };
  Machine.prototype.burst = function () {
    for (var i = 0; i < 70; i++) { var a = Math.random() * 6.283, s = 2 + Math.random() * 6; this.sparks.push({ x: this.cx, y: this.cy - this.R * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.5, life: 1, c: BALLC[i % 4][0] }); }
  };
  Machine.prototype.sprite = function (c) {
    var key = c[0]; if (this.sprites[key]) return this.sprites[key];
    var r = this.rb, d = this.d, cv = document.createElement('canvas'), sz = Math.ceil((r * 2 + 2) * d);
    cv.width = cv.height = sz;
    var x = cv.getContext('2d'); x.scale(d, d);
    var g = x.createRadialGradient(r * 0.75, r * 0.65, r * 0.1, r + 1, r + 1, r);
    g.addColorStop(0, mixHex(c[0], 'w', 0.45)); g.addColorStop(0.6, c[0]); g.addColorStop(1, mixHex(c[0], 'b', 0.35));
    x.fillStyle = g; x.beginPath(); x.arc(r + 1, r + 1, r, 0, 6.283); x.fill();
    x.fillStyle = 'rgba(255,255,255,.38)'; x.beginPath(); x.ellipse(r * 0.78, r * 0.6, r * 0.4, r * 0.2, -0.6, 0, 6.283); x.fill();
    return (this.sprites[key] = cv);
  };
  Machine.prototype.step = function (k) {
    var mix = this.m === 'mix', cx = this.cx, cy = this.cy, rb = this.rb, R = this.R - rb, bs = this.balls, n = bs.length, i, j;
    var g = (mix ? 0.34 : 0.1) * k, jet = (mix ? 1.3 : 0.3) * k, swirl = (mix ? 0.0011 : 0.0004) * k, maxV = mix ? 10 : 3.4;
    for (i = 0; i < n; i++) {
      var b = bs[i], dx = b.x - cx, dy = b.y - cy;
      b.vy += g;
      if (dy > R * 0.25) { b.vy -= jet * (0.5 + Math.random()); b.vx += (Math.random() - 0.5) * jet * 1.7; }
      b.vx += -dy * swirl; b.vy += dx * swirl;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy); if (sp > maxV) { b.vx *= maxV / sp; b.vy *= maxV / sp; }
      b.vx *= 0.995; b.vy *= 0.995;
      b.x += b.vx * k; b.y += b.vy * k;
      dx = b.x - cx; dy = b.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R) { var nx = dx / dist, ny = dy / dist, vn = b.vx * nx + b.vy * ny; b.x = cx + nx * R; b.y = cy + ny * R; if (vn > 0) { b.vx -= 1.85 * vn * nx; b.vy -= 1.85 * vn * ny; } }
      b.rot += b.vx * 0.05 * k;
    }
    var d2 = 4 * rb * rb;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var a = bs[i], c = bs[j], ex = c.x - a.x, ey = c.y - a.y, q = ex * ex + ey * ey;
      if (q < d2 && q > 0.0001) {
        var dd = Math.sqrt(q), ux = ex / dd, uy = ey / dd, ov = (2 * rb - dd) / 2;
        a.x -= ux * ov; a.y -= uy * ov; c.x += ux * ov; c.y += uy * ov;
        var rv = (c.vx - a.vx) * ux + (c.vy - a.vy) * uy;
        if (rv < 0) { var imp = rv * 0.92; a.vx += imp * ux; a.vy += imp * uy; c.vx -= imp * ux; c.vy -= imp * uy; }
      }
    }
    for (i = this.outs.length - 1; i >= 0; i--) { this.outs[i].t += 0.04 * k; if (this.outs[i].t >= 1) this.outs.splice(i, 1); }
    for (i = this.sparks.length - 1; i >= 0; i--) { var s = this.sparks[i]; s.vy += 0.15 * k; s.x += s.vx * k; s.y += s.vy * k; s.life -= 0.018 * k; if (s.life <= 0) this.sparks.splice(i, 1); }
  };
  Machine.prototype.ball = function (b, x0, y0, sc, alpha, ta) {
    var x = this.ctx, rb = this.rb * sc, sp = this.sprite(b.c);
    x.globalAlpha = alpha; x.drawImage(sp, x0 - rb - sc, y0 - rb - sc, (rb + sc) * 2, (rb + sc) * 2);
    x.save(); x.translate(x0, y0); x.rotate(Math.sin(b.rot) * 0.55); if (sc !== 1) x.scale(sc, sc);
    x.globalAlpha = alpha * ta; x.fillStyle = b.c[1]; x.fillText(b.n, 0, 0.5); x.restore();
  };
  Machine.prototype.draw = function () {
    var x = this.ctx, d = this.d, w = this.w, h = this.h, cx = this.cx, cy = this.cy, R = this.R, rb = this.rb, mix = this.m === 'mix', i, k;
    x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h); x.globalAlpha = 1;
    var gl = x.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.25);
    gl.addColorStop(0, mix ? 'rgba(242,193,78,.22)' : 'rgba(242,193,78,.12)'); gl.addColorStop(1, 'rgba(242,193,78,0)');
    x.fillStyle = gl; x.fillRect(0, 0, w, h);
    var gb = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    gb.addColorStop(0, 'rgba(255,255,255,.12)'); gb.addColorStop(1, 'rgba(255,255,255,.025)');
    x.fillStyle = gb; x.beginPath(); x.arc(cx, cy, R, 0, 6.283); x.fill();
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 6.283); x.clip();
    x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = R * 0.12;
    for (k = 0; k < 6; k++) { var an = this.t * (mix ? 1.2 : 0.25) + k * 1.047; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); x.stroke(); }
    x.font = '700 ' + Math.max(7, Math.round(rb * 0.6)) + 'px "IBM Plex Sans KR", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (i = 0; i < this.balls.length; i++) { var b = this.balls[i]; this.ball(b, b.x, b.y, 1, mix ? 0.96 : 0.82, mix ? 0.9 : 0.6); }
    x.restore(); x.globalAlpha = 1;
    var rim = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, 'rgba(242,193,78,.95)'); rim.addColorStop(0.5, 'rgba(255,255,255,.35)'); rim.addColorStop(1, 'rgba(163,94,136,.95)');
    x.strokeStyle = rim; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, R + 1.5, 0, 6.283); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, R - 6, 0, 6.283); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.11)'; x.beginPath(); x.ellipse(cx - R * 0.36, cy - R * 0.52, R * 0.42, R * 0.15, -0.55, 0, 6.283); x.fill();
    x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.ellipse(cx, cy - R, rb * 1.5, rb * 0.5, 0, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(242,193,78,.8)'; x.lineWidth = 2; x.stroke();
    x.font = '700 ' + Math.max(7, Math.round(rb * 0.6)) + 'px "IBM Plex Sans KR", system-ui, sans-serif';
    for (i = 0; i < this.outs.length; i++) {
      var o = this.outs[i], e = 1 - Math.pow(1 - Math.min(1, o.t), 3);
      var px = o.sx + (cx - o.sx) * e, py = o.sy + (Math.max(rb * 2.2, cy - R - rb * 0.6) - o.sy) * e;
      this.ball(o, px, py, 1 + e * 1.1, o.t > 0.7 ? Math.max(0, 1 - (o.t - 0.7) / 0.3) : 1, 1);
    }
    x.globalAlpha = 1;
    for (i = 0; i < this.sparks.length; i++) { var s = this.sparks[i]; x.globalAlpha = Math.max(0, s.life); x.fillStyle = s.c; x.fillRect(s.x - 2, s.y - 2, 4, 6); }
    x.globalAlpha = 1;
  };
  Machine.prototype.frame = function (ts) {
    if (this.cv.clientWidth && this.cv.clientWidth !== this.w) this.resize();
    var dt = this.last ? Math.min(50, ts - this.last) : 16; this.last = ts; this.t += dt / 1000;
    var k = dt / 16.67, sub = this.m === 'mix' ? 2 : 1;
    for (var i = 0; i < sub; i++) this.step(k / sub);
    this.draw();
  };
  function drawLoop() {
    var mc = DR.machine; if (!mc) return;
    if (mc.reduce) { mc.resize(); mc.draw(); return; }
    if (mc.raf) return;
    var f = function (ts) {
      mc.raf = 0;
      if (ui.tab !== 'draw' || document.hidden || !document.body.contains(mc.cv)) { mc.last = 0; return; }
      mc.frame(ts); mc.raf = requestAnimationFrame(f);
    };
    mc.raf = requestAnimationFrame(f);
  }

  /* 추첨 화면 상태: before(12:40 전) / live(12:40~13:00, 현장 추첨 중) / after(그 뒤) / teams(팀 공개됨) */
  var DR = { machine: null, q: '', phase: '' };
  function drawPhase() {
    if (!M) return 'before';
    var hasTeams = M.reveal && M.players.some(function (p) { return p.team; });
    if (hasTeams) return 'teams';
    if (!M.drawAt || !isEventDay()) return 'before';
    var n = now(), end = at(drawTime().end || '') || (M.drawAt + 20 * 60000);
    return n < M.drawAt ? 'before' : n < end ? 'live' : 'after';
  }
  function cdText(left) {
    if (left <= 0) return '곧 시작합니다';
    var dd = Math.floor(left / 864e5);
    if (dd >= 1) return 'D-' + dday() + ' · 10월 31일 ' + drawTime().start;
    var s = Math.floor(left / 1000), p2 = function (v) { return ('0' + v).slice(-2); };
    return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60) + ' 남음';
  }
  function renderDraw() {
    var box = $('#draw'); if (!box || !M) return;
    var list = M.drawRoster;
    if (!list.length) { box.innerHTML = '<div class="empty"><b>참가자 명단을 준비하고 있습니다</b></div>'; DR.machine = null; return; }
    if (!$('#dmCanvas', box)) {
      box.innerHTML =
        '<div class="dm">' +
          '<div class="dm-top"><span class="dm-kicker">' + icon('sparkle-fill') + 'ISFC 20th · OBYB</span><span class="dm-status" id="dmStatus"></span></div>' +
          '<div class="dm-stage"><canvas id="dmCanvas" aria-hidden="true"></canvas><div class="dm-center" id="dmCenter"></div></div>' +
          '<div class="dm-call" id="dmCall"></div>' +
        '</div>' +
        '<div class="dt" id="dtTeams"></div>' +
        '<section class="dr" aria-labelledby="drTitle">' +
          '<div class="dr-head"><h3 class="h3" id="drTitle">참가자 <b id="drCount"></b>명</h3>' +
          '<label class="dr-search">' + icon('magnifying-glass') + '<input id="drSearch" type="search" placeholder="내 이름 찾기" autocomplete="off" enterkeyhint="search"></label></div>' +
          '<div class="dr-list" id="drList"></div><p class="fine" id="drNote"></p>' +
        '</section>';
      DR.machine = new Machine($('#dmCanvas'));
    }
    var ph = drawPhase(); DR.phase = ph;
    DR.machine.sync(list.map(function (p) { return p.n; }));
    DR.machine.m = ph === 'live' ? 'mix' : 'idle';
    updateDrawHead(ph); renderDrawTeams(ph); renderDrawRoster(ph);
    drawLoop();
  }
  function updateDrawHead(ph) {
    var st = $('#dmStatus'), ce = $('#dmCenter'), call = $('#dmCall'); if (!st) return;
    var dt = drawTime(), late = '13시 이후에 도착하시는 분들은 남은 자리에 임의로 배정해 드립니다';
    if (ph === 'teams') {
      st.innerHTML = '<i class="dot ok"></i>팀 배정 완료';
      ce.className = 'dm-center done'; ce.innerHTML = icon('check') + '<span class="dm-big">팀 배정 완료</span><span class="dm-sub">아래에서 팀별 명단을 확인해 주십시오</span>';
      call.innerHTML = '<span class="dm-hint">' + late + '</span>';
    } else if (ph === 'live') {
      st.innerHTML = '<i class="dot live"></i>조 추첨 진행 중';
      ce.className = 'dm-center'; ce.innerHTML = '<span class="dm-big">조 추첨 진행 중</span><span class="dm-sub">현장에서 직접 뽑고 있습니다</span>';
      call.innerHTML = '<span class="dm-hint">' + late + '</span>';
    } else if (ph === 'after') {
      st.innerHTML = '<i class="dot"></i>조 추첨 마감';
      ce.className = 'dm-center'; ce.innerHTML = '<span class="dm-big">조 추첨 마감</span><span class="dm-sub">팀 명단은 곧 이곳에 올라옵니다</span>';
      call.innerHTML = '<span class="dm-hint">' + late + '</span>';
    } else {
      st.innerHTML = '<i class="dot"></i>조 추첨 전';
      ce.className = 'dm-center'; ce.innerHTML = '<span class="dm-time">' + esc(dt.start) + '</span><span class="dm-sub">현장 조 추첨</span><span class="dm-cd" id="dmCd">' + cdText(M.drawAt - now()) + '</span>';
      call.innerHTML = '<span class="dm-hint">' + esc(dt.label) + ' 풋살장에서 직접 조 추첨을 진행합니다.<br>' + late + '</span>';
    }
  }
  function renderDrawTeams(ph) {
    var el = $('#dtTeams'); if (!el) return;
    if (ph !== 'teams') { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = ['A', 'B'].map(function (g) {
      return '<div class="dt-group"><h3 class="group-title">' + g + '조</h3><div class="dt-grid">' + NUMS.map(function (i) {
        var c = g + i, mem = M.players.filter(function (p) { return p.team === c; });
        return '<article class="dt-team' + (ui.mine === c ? ' is-mine' : '') + '" data-team="' + c + '">' +
          '<header>' + badge(c) + '<b>' + esc(M.teams[c].name) + '</b><span class="dt-cnt">' + mem.length + '명</span></header>' +
          '<ol>' + (mem.length ? mem.map(function (p) { return '<li class="on">' + esc(p.name) + '</li>'; }).join('') : '<li></li>') + '</ol></article>';
      }).join('') + '</div></div>';
    }).join('');
  }
  function renderDrawRoster(ph) {
    var el = $('#drList'); if (!el) return;
    var list = M.drawRoster, q = DR.q, teams = ph === 'teams';
    $('#drCount').textContent = list.length;
    el.innerHTML = list.map(function (p) {
      var pl = teams ? M.pBy[p.n] : null, c = pl && pl.team ? pl.team : '';
      return '<button type="button" class="dr-chip' + (c ? ' has' : '') + (c && c === ui.mine ? ' mine' : '') + '" data-pick-name="' + esc(p.n) + '"' + (q && p.n.indexOf(q) < 0 ? ' hidden' : '') + '>' +
        esc(p.n) + (c ? '<span>' + c + '</span>' : '') + '</button>';
    }).join('');
    $('#drNote').textContent = teams ? '내 이름을 누르시면 내 팀으로 설정되어, 경기 일정에서 내 팀 경기만 모아 보실 수 있습니다.'
      : '팀이 정해지면 이곳에 팀이 표시되고, 내 이름을 눌러 내 팀으로 설정하실 수 있습니다.';
  }
  function tickDraw() {
    if (!M || !M.drawRoster.length) return;
    var cd = $('#dmCd'); if (cd && M.drawAt) cd.textContent = cdText(M.drawAt - now());
    if (drawPhase() !== DR.phase) renderDraw();
  }
  function pickMyName(nm) {
    var pl = M.pBy[nm]; if (!M.reveal || !pl || !pl.team) return;
    var c = pl.team;
    ui.mine = c; store.set('mine', c);
    renderFilters(); renderSchedule(); renderStandings(); renderTeams(); renderDraw();
    toast(icon('star-fill') + '<span>' + esc(nm) + ' 님은 <b>' + esc(M.teams[c].name) + '</b>입니다. 내 팀으로 설정했습니다</span>');
    var card = document.querySelector('.dt-team[data-team="' + c + '"]');
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  }

  /* ───────── 기념품 ───────── */
  function renderGoods() {
    var items = M.goods.filter(function (r) { return t(r['품목']); });
    if (!items.length) { $('#goods').innerHTML = '<div class="empty"><b>기념품 정보를 준비하고 있습니다</b></div>'; return; }
    $('#goods').innerHTML = '<div class="goods">' + items.map(function (r) {
      var total = num(r['총수량']) || 0, given = num(r['배부수량']) || 0, left = Math.max(0, total - given);
      var name = t(r['품목']);
      var img = /텀블러|머그/.test(name) ? 'tumbler.jpg?v=20261025c' : /키링|하냥/.test(name) ? 'keyring.jpg?v=20261025c' : '';
      var alt = /텀블러|머그/.test(name) ? 'ISFC 20th ANNYV. 엠블럼이 인쇄된 흰색 머그 텀블러' : /키링|하냥/.test(name) ? 'HANYANG 유니폼을 입은 하냥이 아크릴 키링' : '';
      return '<article class="good">' + (img ? '<img src="' + img + '" alt="' + alt + '" loading="lazy" width="900" height="1125">' : '') +
        '<div class="good-body"><div class="good-name">' + esc(name) + '</div>' +
        (total ? (left ? '<div class="good-left">' + left + '<small>/ ' + total + ' 남음</small></div>' : '<div class="soldout">모두 소진되었습니다</div>') +
          '<div class="meter" role="img" aria-label="' + total + '개 중 ' + left + '개 남음"><i style="width:' + (total ? Math.round(left / total * 100) : 0) + '%"></i></div>' : '') +
        (t(r['수령장소']) ? '<div class="good-where">' + icon('map-pin') + '<span>' + esc(r['수령장소']) + '</span></div>' : '') +
        (t(r['메모']) ? '<div class="good-where">' + esc(r['메모']) + '</div>' : '') +
        '</div></article>';
    }).join('') + '</div>';
  }

  /* ───────── 안주 ───────── */
  function renderFood() {
    var items = M.food.filter(function (r) { return t(r['메뉴']); });
    if (!items.length) { $('#food').innerHTML = '<div class="empty"><b>안주 품목은 곧 알려드리겠습니다</b>준비되는 대로 이곳에 올려 드립니다</div>'; return; }
    $('#food').innerHTML = '<ul class="menu">' + items.map(function (r) {
      var st = t(r['상태']) || '준비중';
      return '<li class="' + (/소진/.test(st) ? 'gone' : '') + '"><span class="nm">' + esc(r['메뉴']) + (t(r['수량']) ? '<small>' + esc(r['수량']) + '</small>' : '') + '</span>' +
        '<span class="fs fs-' + esc(st) + '">' + esc(st) + '</span>' +
        (t(r['메모']) ? '<span class="memo">' + esc(r['메모']) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  /* ───────── 뒤풀이 ───────── */
  function renderParty() {
    var P = M.party, R = partyRounds();
    var cards = R.map(function (r, i) {
      var q = (r.place + ' ' + r.addr.replace(/^\(샘플\)\s*/, '')).trim();
      var map = r.map || (r.addr ? 'https://map.kakao.com/link/search/' + encodeURIComponent(r.addr.replace(/^\(샘플\)\s*/, '')) : '');
      var id = 'addr' + i;
      return '<article class="round' + (i === 0 ? ' first' : '') + '">' +
        '<div class="round-head"><span class="round-key">' + esc(r.key || '뒤풀이') + '</span><span class="round-time' + (hhmm(r.time) ? '' : ' txt') + '">' + esc(hhmm(r.time) || r.time || '시간 공지 예정') + '</span></div>' +
        '<div class="round-place' + (r.place ? '' : ' tbd') + '">' + esc(r.place || '장소는 곧 알려드리겠습니다') + '</div>' +
        (r.addr ? '<div class="addr"><span id="' + id + '">' + esc(r.addr) + '</span><button type="button" class="copy" data-copy="' + id + '">' + icon('copy') + '복사</button></div>' : '') +
        (map && q ? '<a class="btn btn-ghost round-map" href="' + esc(map) + '" target="_blank" rel="noopener">' + icon('map-trifold') + '지도에서 보기</a>' : '') +
        '</article>';
    }).join('<div class="round-arrow" aria-hidden="true">' + icon('arrow-right') + '</div>');
    var rows = [];
    if (P['회비']) rows.push(['회비', esc(P['회비'])]);
    if (P['이동방법']) rows.push(['이동', esc(P['이동방법'])]);
    $('#party').innerHTML =
      (cards ? '<div class="rounds">' + cards + '</div>' : '<div class="empty"><b>뒤풀이 장소는 곧 알려드리겠습니다</b></div>') +
      (rows.length ? '<dl class="kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' : '') +
      (P['공지'] ? '<p class="quote">' + esc(P['공지']) + '</p>' : '') +
      '<div class="callout">' + icon('car') + '<p><b>차량은 뒤풀이 전에 빼 두시면 요금을 아끼실 수 있습니다.</b> 교내에 하루 종일 두시면 최대 24,000원입니다. <a href="#parking" data-scroll="parking">주차 안내 보기</a></p></div>';
  }

  /* ───────── 전체 그리기 ───────── */
  function renderAll() {
    M = build();
    renderTicker(); renderNotices(); renderHero(); renderFlow();
    renderBoard(); renderFilters(); renderSchedule(); renderStandings(); renderBracket(); renderRules();
    renderScorers(); renderTeams(); renderDeco(false); renderDraw(); renderGoods(); renderFood(); renderParty();
    tickClocks();
  }
  function tick() { // 1분 단위로 바뀌는 것들 (남은 시간, 흐름)
    if (!M) return;
    renderHero(); renderFlow(); renderBoard(); renderSchedule(); if (!M.reveal) renderTeams();
    tickClocks();
  }

  /* 골, 새 공지 알림 */
  var toastQ = [], toastOn = false;
  function toast(html) { toastQ.push(html); if (!toastOn) nextToast(); }
  function nextToast() {
    var el = $('#toast'), h = toastQ.shift();
    if (!h) { toastOn = false; el.hidden = true; return; }
    toastOn = true; el.hidden = false; el.innerHTML = h;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    setTimeout(nextToast, 4200);
  }
  function detectChanges() {
    var cur = {};
    M.matches.forEach(function (m) { cur[m.no] = [m.hg || 0, m.ag || 0]; });
    if (prevScores) {
      M.matches.forEach(function (m) {
        var p = prevScores[m.no]; if (!p) return;
        var c = cur[m.no];
        if (c[0] > p[0] || c[1] > p[1]) {
          var g = M.goals.filter(function (x) { return x.no === m.no; }).pop();
          toast('<span class="goal">GOAL</span><span>' + esc(m.court) + ' ' + side(m.home) + ' <b>' + c[0] + ':' + c[1] + '</b> ' + side(m.away) + (g ? ' · ' + esc(g.name) : '') + '</span>');
        }
      });
    }
    prevScores = cur;
    var last = M.notices[M.notices.length - 1], sig = last ? last.time + '|' + last.text : '';
    if (prevNotice !== null && sig && sig !== prevNotice) {
      var tk = $('#ticker'); tk.classList.remove('flash'); void tk.offsetWidth; tk.classList.add('flash');
      toast(icon(last.level === '긴급' ? 'siren-fill' : 'megaphone-fill') + '<span>새 공지 · ' + esc(last.text) + '</span>');
    }
    prevNotice = sig;
  }

  /* 동기화 표시 */
  function renderSync() {
    var el = $('#sync'), tx = $('#syncText');
    if (DEMO) { el.dataset.state = 'demo'; tx.textContent = '샘플 데이터'; return; }
    if (!loaded) { el.dataset.state = failing ? 'error' : ''; tx.textContent = failing ? '연결 확인 중' : '불러오는 중'; return; }
    var s = Math.round((Date.now() - lastOk) / 1000);
    el.dataset.state = failing ? 'error' : 'live';
    tx.textContent = failing ? '재연결 중 · ' + ago(s) : '실시간 · ' + ago(s);
  }
  function ago(s) { return s < 10 ? '방금' : s < 60 ? s + '초 전' : Math.floor(s / 60) + '분 전'; }

  /* 불러오기 */
  function load(list) {
    return Promise.all(list.map(function (name) {
      return fetchSheet(name).then(function (rows) { D[name] = rows; return true; }, function () { return false; });
    })).then(function (res) {
      var ok = res.filter(Boolean).length;
      failing = ok === 0;
      if (ok) { lastOk = Date.now(); loaded = true; }
      var sig = JSON.stringify(D);
      if (sig !== lastSig) { lastSig = sig; renderAll(); detectChanges(); }
      if (!loaded && failing) showLoadError();
      renderSync();
    });
  }
  function showLoadError() {
    $('#board').innerHTML = '<div class="empty" style="grid-column:1/-1"><b>경기 정보를 불러오지 못했습니다</b>잠시 후 자동으로 다시 시도합니다. 계속되면 운영진에게 알려 주십시오.</div>';
  }
  var fastTimer = null, slowTimer = null;
  function schedule() {
    clearTimeout(fastTimer); clearTimeout(slowTimer);
    if (DEMO || document.hidden) return;
    fastTimer = setTimeout(function () { load(FAST).then(schedule); }, CFG.POLL_FAST_SEC * 1000);
    slowTimer = setTimeout(function () { load(SLOW); }, CFG.POLL_SLOW_SEC * 1000);
  }
  function refreshNow() { if (DEMO) return; load(SHEETS).then(schedule); }

  /* ───────── 화면 전환 ───────── */
  function showTab(tab, opts) {
    if (TABS.indexOf(tab) < 0) tab = 'info';
    ui.tab = tab;
    $$('.view').forEach(function (v) { v.hidden = v.dataset.view !== tab; });
    $$('.tabs a').forEach(function (a) { var on = a.dataset.tab === tab; a.setAttribute('aria-selected', String(on)); if (on && a.scrollIntoView) { var tr = a.parentElement; tr.scrollTo({ left: a.offsetLeft - tr.clientWidth / 2 + a.clientWidth / 2, behavior: 'smooth' }); } });
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    if (tab === 'draw') drawLoop();
  }
  function showSub(sub) {
    ui.sub = sub;
    $$('.subtabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.sub === sub)); });
    $$('.sub').forEach(function (s) { s.hidden = s.dataset.subview !== sub; });
  }
  function fromHash() {
    var h = (location.hash || '').replace('#', '');
    if (h === 'parking') { showTab('info', { keepScroll: true }); setTimeout(function () { var p = $('#parking'); if (p) p.scrollIntoView({ behavior: 'smooth' }); }, 30); return; }
    showTab(TABS.indexOf(h) >= 0 ? h : 'info');
  }

  function openSheet() { var s = $('#noticeSheet'); s.hidden = false; var b = $('[data-close]', s.querySelector('.sheet-panel')); if (b) b.focus(); }
  function closeOverlays() { $('#noticeSheet').hidden = true; $('#zoom').hidden = true; }

  document.addEventListener('click', function (e) {
    if (e.target.matches && e.target.matches('.tbox input') && e.target.showPicker && window.matchMedia && matchMedia('(pointer: fine)').matches) { try { e.target.showPicker(); } catch (x) { /* 무시 */ } }
    var dt = e.target.closest('[data-deco-team]');
    if (dt) { if (dt.dataset.decoTeam !== dz.team) { pickDecoTeam(dt.dataset.decoTeam); renderDeco(true); } return; }
    var a = e.target.closest('[data-tab]');
    if (a && a.dataset.decoPick) { pickDecoTeam(a.dataset.decoPick); renderDeco(true); }
    if (a) { e.preventDefault(); var tab = a.dataset.tab; if (location.hash !== '#' + tab) { try { history.pushState(null, '', '#' + tab); } catch (x) { /* 무시 */ } } showTab(tab); return; }
    var sc = e.target.closest('[data-scroll]');
    if (sc) { e.preventDefault(); showTab('info', { keepScroll: true }); var el = document.getElementById(sc.dataset.scroll); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
    var pk = e.target.closest('[data-park]'); if (pk) { setPark(pk.dataset.park); return; }
    var pr = e.target.closest('[data-preset]'); if (pr) { var v = pr.dataset.preset.split(','); $('#calcIn').value = v[0]; $('#calcOut').value = v[1]; calc(); return; }
    var sb = e.target.closest('[data-sub]'); if (sb) { showSub(sb.dataset.sub); return; }
    var fl = e.target.closest('[data-filter]'); if (fl) { ui.filter = fl.dataset.filter; ui.pickMine = false; store.set('filter', ui.filter); renderFilters(); renderSchedule(); return; }
    var ms = e.target.closest('[data-mine-set]'); if (ms) { ui.mine = ms.dataset.mineSet; ui.pickMine = false; store.set('mine', ui.mine); renderFilters(); renderSchedule(); renderStandings(); renderTeams(); var sc0 = $('#schedule'); if (sc0) sc0.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (e.target.closest('[data-mine-change]')) { ui.pickMine = true; renderSchedule(); return; }
    if (e.target.closest('#ticker') || e.target.closest('[data-open="notices"]')) { openSheet(); return; }
    var z = e.target.closest('[data-zoom]');
    if (z) {
      var zo = $('#zoom'), sc2 = $('.zoom-scroll', zo);
      sc2.innerHTML = '';
      if (z.dataset.zoom === 'overview') { var st = $('#ovmap .ovmap-stage').cloneNode(true); st.classList.add('zoomed'); sc2.appendChild(st); }
      else { var im = document.createElement('img'); im.src = z.dataset.zoom; im.alt = '지도 크게 보기'; sc2.appendChild(im); }
      zo.hidden = false;
      setTimeout(function () { sc2.scrollLeft = (sc2.scrollWidth - sc2.clientWidth) / 2; sc2.scrollTop = (sc2.scrollHeight - sc2.clientHeight) / 2; }, 30);
      $('.zoom-close').focus(); return;
    }
    if (e.target.closest('[data-close]')) { closeOverlays(); return; }
    var cp = e.target.closest('[data-copy]');
    if (cp) {
      var src = document.getElementById(cp.dataset.copy), text = src ? src.textContent : '';
      var ok = function () { cp.innerHTML = icon('check') + '복사됨'; setTimeout(function () { cp.innerHTML = icon('copy') + '복사'; }, 1800); };
      var fallback = function () { var r = document.createRange(); r.selectNodeContents(src); var s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      try { navigator.clipboard.writeText(text).then(ok, fallback); } catch (x) { fallback(); }
      return;
    }
    if (e.target.closest('#sync')) { refreshNow(); return; }
    var pn = e.target.closest('[data-pick-name]'); if (pn) { pickMyName(pn.dataset.pickName); return; }
    var ft = e.target.closest('[data-fit]');
    if (ft && dz.src) { dz.fit = ft.dataset.fit; try { dz.img = squarePhoto(dz.src, dz.fit); } catch (x) { /* 무시 */ } updateDeco(); return; }
    if (e.target.closest('#decoClear')) { dz.img = ''; dz.src = null; decoMsg('', ''); updateDeco(); return; }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'decoForm') { e.preventDefault(); var i = $('#decoName'); if (i) i.blur(); saveDeco(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'calcIn' || e.target.id === 'calcOut') { calc(); return; }
    if (e.target.id === 'decoFile') {
      var f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      decoMsg('사진을 줄이고 있습니다…', ''); updateDeco();
      loadPhoto(f).then(function (im) { dz.src = im; dz.fit = 'cover'; dz.img = squarePhoto(im, dz.fit); decoMsg('', ''); updateDeco(); },
        function (er) { decoMsg(er.message, 'err'); updateDeco(); });
      return;
    }
    if (e.target.id === 'mine') { ui.mine = e.target.value; store.set('mine', ui.mine); renderFilters(); renderSchedule(); renderStandings(); renderTeams(); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'calcIn' || e.target.id === 'calcOut') calc();
    if (e.target.id === 'decoName') { dz.name = e.target.value; if (dz.kind === 'ok') decoMsg('', ''); updateDeco(); }
    if (e.target.id === 'drSearch') { DR.q = t(e.target.value); if (M) renderDrawRoster(DR.phase || drawPhase()); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlays(); });
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { refreshNow(); fetchDeco().then(scheduleDeco); drawLoop(); } else { schedule(); scheduleDeco(); }
  });

  /* 고정 영역 높이 → 스크롤 여백 */
  function measure() { var s = $('#stick'); if (s) document.documentElement.style.setProperty('--stick-h', s.offsetHeight + 'px'); }
  window.addEventListener('resize', function () { measure(); if (DR.machine) { DR.machine.resize(); if (DR.machine.reduce) DR.machine.draw(); } });

  /* ───────── 시작 ───────── */
  setPark(ui.park); calc(); measure(); fromHash();
  decoCss();
  if (CFG.DECO_URL) fetchDeco().then(scheduleDeco);
  if (DEMO) {
    SHEETS.forEach(function (s) { D[s] = (window.ISFC_DEMO && window.ISFC_DEMO[s]) || []; });
    loaded = true; lastOk = Date.now();
    $('#demoNote').hidden = false;
    renderAll(); detectChanges(); renderSync();
  } else {
    renderAll();
    $('#board').innerHTML = '<div class="court skel" style="height:220px"></div><div class="court skel" style="height:220px"></div>';
    renderSync();
    load(SHEETS).then(schedule);
  }
  setInterval(function () { renderSync(); }, 5000);
  setInterval(tick, 30000);
  setInterval(tickClocks, 1000);
  setInterval(tickDraw, 1000);
})();
