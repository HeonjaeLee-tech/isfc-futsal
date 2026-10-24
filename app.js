/* ISFC 20주년 OBYB 풋살대회 · 실시간 안내 사이트
 * 데이터: 구글 시트(gviz CSV, 실패 시 JSONP) → 순위·대진·득점왕은 여기서 계산
 */
(function () {
  'use strict';

  var CFG = Object.assign({ SHEET_ID: '', EVENT_DATE: '2026-10-31', POLL_FAST_SEC: 20, POLL_SLOW_SEC: 120, DEMO_NOW: '' }, window.ISFC_CONFIG || {});
  var DEMO = !String(CFG.SHEET_ID || '').trim();
  var BOOT = Date.now();
  var SHEETS = ['공지', '경기', '득점', '팀', '선수', '기념품', '안주', '뒤풀이', '설정'];
  var FAST = ['공지', '경기', '득점'];
  var SLOW = ['팀', '선수', '기념품', '안주', '뒤풀이', '설정'];
  var TABS = ['info', 'match', 'scorers', 'teams', 'goods', 'food', 'party'];
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
  function hhmm(s) { var m = t(s).match(/(\d{1,2})\s*:\s*(\d{2})/); return m ? (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2] : null; }
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
    tab: 'info', sub: 'schedule', filter: 'all',
    mine: store.get('mine') || '', park: store.get('park') || 'in'
  };

  /* ───────── 모델 계산 ───────── */
  function build() {
    var settings = {};
    D['설정'].forEach(function (r) { if (r['항목']) settings[r['항목']] = r['값'] || ''; });
    var reveal = /^(o|ㅇ|y|yes|공개|true)$/i.test(t(settings['팀공개']));

    var teams = {};
    D['팀'].forEach(function (r) {
      var code = t(r['팀코드']).toUpperCase();
      if (!/^[AB][1-5]$/.test(code)) return;
      teams[code] = { code: code, group: code[0], rawName: t(r['팀명']), color: VEST[t(r['조끼색'])] || null, colorName: t(r['조끼색']), captain: t(r['주장']), motto: t(r['한마디']) };
    });
    ['A', 'B'].forEach(function (g) { for (var i = 1; i <= 5; i++) { var c = g + i; if (!teams[c]) teams[c] = { code: c, group: g, rawName: '', color: null }; } });
    Object.keys(teams).forEach(function (c) { var tm = teams[c]; tm.name = reveal && tm.rawName ? tm.rawName : c + '팀'; if (!reveal) tm.color = null; });

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
      for (var i = 1; i <= 5; i++) rows[g + i] = { code: g + i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
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

    return { settings: settings, reveal: reveal, teams: teams, players: players, pBy: pBy, matches: matches, byNo: byNo, S: S, goals: goals, scorers: scorers, notices: notices, goods: D['기념품'], food: D['안주'], party: party };
  }

  /* ───────── 공통 조각 ───────── */
  function badge(code, size) {
    var tm = code && M.teams[code];
    if (!tm) return '<span class="badge tbd ' + (size || '') + '" aria-hidden="true">?</span>';
    var bg = tm.color, fg = 'var(--ink)';
    if (bg) { var r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16); fg = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1d1a1f' : '#ffffff'; }
    var style = bg ? ' style="background:' + bg + ';color:' + fg + '"' : '';
    return '<span class="badge ' + (size || '') + '"' + style + ' aria-hidden="true">' + esc(code) + '</span>';
  }
  function side(ref) { return ref.code ? esc(M.teams[ref.code].name) : esc(ref.label); }
  function stageChip(m) { return '<span class="stage' + (m.ko ? ' ko' : '') + '">' + esc(m.stage || '경기') + '</span>'; }
  function statusChip(m, onBoard) {
    if (m.status === 'live') return '<span class="st st-live">LIVE</span>';
    if (m.status === 'done') return '<span class="st st-done">종료</span>';
    return '<span class="st">' + (onBoard ? '다음 경기' : '예정') + '</span>';
  }
  function untilText(m) {
    if (!m.at) return m.time ? m.time + ' 시작' : '시간 미정';
    if (!isEventDay()) return '10/31 ' + m.time + ' 시작';
    var d = m.at - now();
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
    if (!last) { el.dataset.level = '일반'; tag.textContent = '공지'; tx.textContent = '아직 공지가 없어요'; tx.classList.remove('run'); return; }
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
    if (!list.length) return '<li class="empty" style="display:block"><b>아직 공지가 없어요</b>공지가 올라오면 여기와 맨 위 배너에 떠요</li>';
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
  function renderHero() {
    var d = dday(), el = $('#heroDday');
    var dd = d > 0 ? 'D-' + d : d === 0 ? 'D-DAY' : '종료';
    el.innerHTML = '<span class="dd">' + dd + '</span>' + (d === 0 ? '오늘이에요! 10월 31일 토요일' : '10월 31일 토요일');
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
    var items = [
      [M.settings['개회식'] || '14:00', '개회식 & 팀 발표', 'OB와 YB를 섞은 10팀 공개'],
      [g1 && g1.time, '조별리그', 'A조 1구장, B조 2구장 · 팀당 4경기'],
      [k1 && k1.time, '토너먼트', '각 조 1~3위, 조 1위는 4강 직행'],
      [th && th.time, '3·4위전', ''],
      [fi && fi.time, '결승', fi && fi.memo ? fi.memo : ''],
      [M.settings['시상식'] || '17:50', '시상식', '1·2·3등, 득점왕'],
      [hhmm(M.party['시간']) || '19:30', '2부 뒤풀이', M.party['장소'] || '장소는 뒤풀이 탭에서 공지']
    ].filter(function (x) { return x[0]; });
    var n = now(), ev = isEventDay(), cur = -1;
    if (ev) items.forEach(function (x, i) { var a = at(x[0]); if (a && a <= n) cur = i; });
    $('#flow').innerHTML = items.map(function (x, i) {
      var cls = ev ? (i < cur ? 'done' : i === cur ? 'now' : '') : '';
      return '<li class="' + cls + '"><time>' + esc(hhmm(x[0]) || x[0]) + '</time><span>' + esc(x[1]) + (x[2] ? '<small>' + esc(x[2]) + '</small>' : '') + '</span></li>';
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
    if (!a || !b) { dur.textContent = '시간을 넣어주세요'; fee.textContent = '-'; return; }
    var toMin = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; };
    var m = toMin(b) - toMin(a);
    if (m < 0) { dur.textContent = '나가는 시간이 더 빨라요'; fee.textContent = '-'; return; }
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
      var foot = m.status === 'live' ? (nxt ? '다음 <b>' + esc(nxt.time) + '</b> ' + side(nxt.home) + ' vs ' + side(nxt.away) : '이 구장 마지막 경기')
        : m.status === 'sched' ? untilText(m)
        : '이 구장 경기 모두 끝';
      var sig = m.no + ':' + m.hg + ':' + m.ag;
      return '<div class="court' + (m.status === 'live' ? ' is-live' : '') + '" data-court="' + esc(c) + '" data-sig="' + sig + '" data-prev="' + esc(old[c] || '') + '">' +
        '<div class="court-head"><span class="court-name">' + esc(c) + '</span>' + statusChip(m, true) + '</div>' +
        '<div class="court-stage">#' + m.no + ' ' + esc(m.stage) + (m.status === 'sched' ? '' : ' · ' + esc(m.time)) + '</div>' +
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
    var opts = [['all', '전체'], ['1구장', '1구장'], ['2구장', '2구장'], ['A', 'A조'], ['B', 'B조'], ['ko', '토너먼트']];
    var sel = M.reveal ? '<select class="myteam' + (ui.mine ? ' on' : '') + '" id="mine" aria-label="내 팀 경기 강조"><option value="">내 팀 고르기</option>' +
      ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'].map(function (c) { return '<option value="' + c + '"' + (ui.mine === c ? ' selected' : '') + '>' + c + ' ' + esc(M.teams[c].name) + '</option>'; }).join('') + '</select>' : '';
    $('#filters').innerHTML = sel + opts.map(function (o) { return '<button type="button" class="chip" data-filter="' + o[0] + '" aria-pressed="' + (ui.filter === o[0]) + '">' + o[1] + '</button>'; }).join('');
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
  function renderSchedule() {
    var f = ui.filter;
    var list = M.matches.filter(function (m) {
      if (f === 'all') return true;
      if (f === 'ko') return m.ko;
      if (f === 'A' || f === 'B') return m.group === f;
      return m.court === f;
    });
    if (!list.length) { $('#schedule').innerHTML = '<div class="empty"><b>보여줄 경기가 없어요</b>[경기] 시트에 경기를 채우면 여기에 떠요</div>'; return; }
    var slots = [], idx = {};
    list.forEach(function (m) { var k = m.time || '시간 미정'; if (!(k in idx)) { idx[k] = slots.length; slots.push({ time: k, items: [] }); } slots[idx[k]].items.push(m); });
    $('#schedule').innerHTML = slots.map(function (s) {
      var ko = s.items.every(function (m) { return m.ko; }), st = s.items.map(function (m) { return m.stage; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');
      return '<div class="slot"><h3 class="slot-time">' + esc(s.time) + '<small>' + esc(ko ? st : '조별리그') + '</small></h3><div class="slot-list">' + s.items.map(matchRow).join('') + '</div></div>';
    }).join('');
  }

  /* ───────── 경기: 순위표 ───────── */
  function renderStandings() {
    $('#standings').innerHTML = ['A', 'B'].map(function (g) {
      var st = M.S[g];
      var rows = st.list.map(function (r, i) {
        var cls = i === 0 ? 'r1' : i < 3 ? 'r2' : 'r0';
        return '<tr' + (r.code === ui.mine ? ' style="background:var(--brand-soft)"' : '') + '><td><span class="rank ' + cls + '">' + (i + 1) + '</span></td>' +
          '<td><div class="tcell">' + badge(r.code, 'sm') + '<span class="nm">' + esc(M.teams[r.code].name) + '</span></div></td>' +
          '<td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pts">' + r.pts + '</td></tr>';
      }).join('');
      return '<h3 class="group-title">' + g + '조<small>' + st.played + ' / ' + st.total + ' 경기 끝' + (st.complete ? ' · 순위 확정' : '') + '</small></h3>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">순위</th><th scope="col">팀</th><th scope="col">경기</th><th scope="col">승</th><th scope="col">무</th><th scope="col">패</th><th scope="col">득실</th><th scope="col">승점</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('') + '<div class="tbl-legend"><span><i class="rank r1"></i>4강 직행</span><span><i class="rank r2"></i>4강 진출전</span><span>승점 같으면 골득실 → 다득점 → 승자승</span></div>';
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
    var champ = '';
    if (fi && fi.win) {
      var lose = fi.win === fi.home.code ? fi.away.code : fi.home.code;
      var third = th && th.win;
      champ = '<div class="champion">' + icon('trophy-fill') + '<div><b>우승 ' + esc(M.teams[fi.win].name) + '</b><div style="font-size:13px;opacity:.85">준우승 ' + esc(M.teams[lose].name) + (third ? ' · 3위 ' + esc(M.teams[third].name) : '') + '</div></div></div>';
    }
    $('#bracket').innerHTML = champ +
      '<div class="bracket-scroll"><div class="bracket">' +
        '<div class="br-head" style="grid-column:1">4강 진출전</div><div class="br-head" style="grid-column:3">4강</div><div class="br-head" style="grid-column:5">결승</div>' +
        '<div style="grid-column:1;grid-row:2/4;align-self:center">' + bm(r1[0]) + '</div>' +
        '<div style="grid-column:1;grid-row:4/6;align-self:center">' + bm(r1[1]) + '</div>' +
        '<div class="br-line" style="grid-column:2;grid-row:2/4"></div><div class="br-line" style="grid-column:2;grid-row:4/6"></div>' +
        '<div style="grid-column:3;grid-row:2/4;align-self:center">' + bm(sf[0]) + '</div>' +
        '<div style="grid-column:3;grid-row:4/6;align-self:center">' + bm(sf[1]) + '</div>' +
        '<div class="br-join" style="grid-column:4;grid-row:2/6"></div>' +
        '<div style="grid-column:5;grid-row:2/6;align-self:center">' + bm(fi, 'final') + '</div>' +
      '</div></div>' +
      '<div class="third"><div class="br-head">3·4위전</div>' + bm(th) + '</div>' +
      '<p class="fine">조별리그가 끝나면 "A조 2위" 같은 자리가 실제 팀으로 자동으로 바뀌어요.</p>';
  }

  /* ───────── 경기: 진행 방식 ───────── */
  function renderRules() {
    var s = M.settings;
    $('#rules').innerHTML =
      '<ol class="steps">' +
        '<li><div><b>팀 매칭</b><p>OB와 YB 선수를 섞어 실력 밸런스를 맞춘 뒤 랜덤으로 10팀을 만들어요.</p></div></li>' +
        '<li><div><b>조별 풀리그</b><p>A조 5팀, B조 5팀이 같은 조 모든 팀과 한 번씩, 팀당 4경기를 뛰어요. 경기 시간 ' + esc(s['조별리그 경기시간'] || '12분') + '.</p></div></li>' +
        '<li><div><b>토너먼트</b><p>각 조 1~3위가 올라가요. 조 1위는 4강 직행, 2위와 3위는 상대 조와 교차로 4강 진출전을 치러요. 경기 시간 ' + esc(s['토너먼트 경기시간'] || '12분') + '.</p></div></li>' +
        '<li><div><b>결승과 3·4위전</b><p>토너먼트에서 비기면 ' + esc(s['토너먼트 무승부'] || '승부차기') + '로 가려요.</p></div></li>' +
      '</ol>' +
      '<h3 class="h3">조 순위 정하는 법</h3>' +
      '<div class="order"><span class="chip">승점 (승 3 · 무 1 · 패 0)</span>' + icon('caret-right') + '<span class="chip">골득실</span>' + icon('caret-right') + '<span class="chip">다득점</span>' + icon('caret-right') + '<span class="chip">승자승</span></div>' +
      '<p class="quote">승패와 상관없이 많은 경기를 뛸 수 있도록 진행해요!</p>';
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
    if (!L.length) { $('#scorers').innerHTML = '<div class="empty"><b>아직 골이 없어요</b>첫 골의 주인공은 누가 될까요? 골이 기록되면 바로 순위가 떠요</div>'; return; }
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
      var open = at(M.settings['개회식'] || '14:00'), left = open ? open - now() : 0;
      var cd = '';
      if (left > 0) { var dd = Math.floor(left / 864e5), hh = Math.floor(left % 864e5 / 36e5), mi = Math.floor(left % 36e5 / 6e4); cd = '<div class="cd">' + (dd ? dd + '일 ' : '') + hh + '시간 ' + mi + '분</div><p>공개까지 남은 시간</p>'; }
      $('#teams').innerHTML = '<div class="locked">' + icon('lock-simple') + '<h3>팀 매칭은 당일 공개</h3><p>OB와 YB를 섞어 실력 밸런스를 맞춘 10팀이 A조와 B조로 나뉘어요. 개회식에서 발표하고 여기에도 바로 떠요.</p>' + cd + '</div>';
      return;
    }
    var html = ['A', 'B'].map(function (g) {
      var st = M.S[g], recBy = {}; st.list.forEach(function (r, i) { recBy[r.code] = { r: r, pos: i + 1 }; });
      var cards = [1, 2, 3, 4, 5].map(function (i) {
        var c = g + i, tm = M.teams[c], rec = recBy[c];
        var roster = M.players.filter(function (p) { return p.team === c; });
        var nxt = M.matches.filter(function (m) { return m.status !== 'done' && involves(m, c); })[0];
        var vs = nxt ? (nxt.home.code === c ? nxt.away : nxt.home) : null;
        return '<article class="team' + (ui.mine === c ? ' is-mine' : '') + '">' +
          '<div class="team-head">' + badge(c, 'lg') + '<div><div class="team-name">' + esc(tm.name) + '</div>' +
          '<div class="team-rec">' + esc(c) + (tm.colorName ? ' · ' + esc(tm.colorName) + ' 조끼' : '') + ' · ' + (rec && rec.r.p ? rec.r.w + '승 ' + rec.r.d + '무 ' + rec.r.l + '패, ' + rec.r.gf + '골 · ' + g + '조 ' + rec.pos + '위' : '아직 경기 전') + '</div></div></div>' +
          (tm.motto ? '<p class="team-motto">' + esc(tm.motto) + '</p>' : '') +
          (roster.length ? '<div class="roster">' + roster.map(function (p) {
            var cap = (tm.captain && tm.captain === p.name) || /주장/.test(p.memo);
            return '<span class="' + (cap ? 'cap' : '') + '">' + (cap ? icon('crown-simple-fill') : '') + esc(p.name) + (p.year ? ' <small>' + esc(p.year) + '</small>' : '') + (p.kind ? '<span class="ob' + (p.kind === 'YB' ? ' yb' : '') + '" style="border:0;padding:1px 6px">' + esc(p.kind) + '</span>' : '') + '</span>';
          }).join('') + '</div>' : '<p class="muted" style="margin:0;font-size:13px">선수 명단 준비 중</p>') +
          (nxt ? '<div class="team-next">' + icon('clock') + '다음 경기 <b>' + esc(nxt.time) + ' ' + esc(nxt.court) + '</b> vs ' + side(vs) + '</div>' : '') +
          '</article>';
      }).join('');
      return '<h3 class="group-title">' + g + '조</h3><div class="teams">' + cards + '</div>';
    }).join('');
    $('#teams').innerHTML = html;
  }

  /* ───────── 기념품 ───────── */
  function renderGoods() {
    var items = M.goods.filter(function (r) { return t(r['품목']); });
    if (!items.length) { $('#goods').innerHTML = '<div class="empty"><b>기념품 정보 준비 중</b></div>'; return; }
    $('#goods').innerHTML = '<div class="goods">' + items.map(function (r) {
      var total = num(r['총수량']) || 0, given = num(r['배부수량']) || 0, left = Math.max(0, total - given);
      var name = t(r['품목']);
      var img = /텀블러|머그/.test(name) ? 'assets/img/tumbler.jpg' : /키링|하냥/.test(name) ? 'assets/img/keyring.jpg' : '';
      var alt = /텀블러|머그/.test(name) ? 'ISFC 20th ANNYV. 엠블럼이 인쇄된 흰색 머그 텀블러' : /키링|하냥/.test(name) ? 'HANYANG 유니폼을 입은 하냥이 아크릴 키링' : '';
      return '<article class="good">' + (img ? '<img src="' + img + '" alt="' + alt + '" loading="lazy" width="900" height="1200">' : '') +
        '<div class="good-body"><div class="good-name">' + esc(name) + '</div>' +
        (total ? (left ? '<div class="good-left">' + left + '<small>/ ' + total + ' 남음</small></div>' : '<div class="soldout">모두 나갔어요</div>') +
          '<div class="meter" role="img" aria-label="' + total + '개 중 ' + left + '개 남음"><i style="width:' + (total ? Math.round(left / total * 100) : 0) + '%"></i></div>' : '') +
        (t(r['수령장소']) ? '<div class="good-where">' + icon('map-pin') + '<span>' + esc(r['수령장소']) + '</span></div>' : '') +
        (t(r['메모']) ? '<div class="good-where">' + esc(r['메모']) + '</div>' : '') +
        '</div></article>';
    }).join('') + '</div>';
  }

  /* ───────── 안주 ───────── */
  function renderFood() {
    var items = M.food.filter(function (r) { return t(r['메뉴']); });
    if (!items.length) { $('#food').innerHTML = '<div class="empty"><b>안주 라인업은 곧 공개돼요</b>찬조해주시는 선배님들 안주도 여기에 올라와요</div>'; return; }
    var givers = [];
    items.forEach(function (r) { var g = t(r['찬조']); if (g) givers.push({ who: g, what: t(r['메뉴']) }); });
    $('#food').innerHTML = '<ul class="menu">' + items.map(function (r) {
      var st = t(r['상태']) || '준비중';
      return '<li class="' + (/소진/.test(st) ? 'gone' : '') + '"><span class="nm">' + esc(r['메뉴']) + (t(r['수량']) ? '<small>' + esc(r['수량']) + '</small>' : '') + '</span>' +
        '<span class="fs fs-' + esc(st) + '">' + esc(st) + '</span>' +
        (t(r['찬조']) ? '<span class="by">' + icon('crown-simple-fill') + esc(r['찬조']) + ' 찬조</span>' : '') +
        (t(r['메모']) ? '<span class="memo">' + esc(r['메모']) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' +
    (givers.length ? '<div class="thanks"><h3>' + icon('star-fill') + '찬조해주셔서 감사합니다</h3><ul>' + givers.map(function (g) { return '<li>' + esc(g.who) + '<small>' + esc(g.what) + '</small></li>'; }).join('') + '</ul></div>' : '');
  }

  /* ───────── 뒤풀이 ───────── */
  function renderParty() {
    var P = M.party;
    var place = P['장소'], addr = P['주소'];
    var map = P['지도링크'] || (addr ? 'https://map.kakao.com/link/search/' + encodeURIComponent(addr.replace(/^\(샘플\)\s*/, '')) : '');
    var rows = [];
    if (addr) rows.push(['주소', '<div class="addr"><span id="addrText">' + esc(addr) + '</span><button type="button" class="copy" data-copy="addrText">' + icon('copy') + '복사</button></div>']);
    if (P['회비']) rows.push(['회비', esc(P['회비'])]);
    if (P['이동방법']) rows.push(['이동', esc(P['이동방법'])]);
    $('#party').innerHTML =
      '<div class="party-hero"><div class="party-time">' + esc(P['시간'] || '19:30~') + '</div><div class="party-place' + (place ? '' : ' tbd') + '">' + esc(place || '장소는 곧 공지할게요') + '</div></div>' +
      (rows.length ? '<dl class="kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' : '') +
      (map ? '<div class="links" style="margin-bottom:16px"><a class="btn btn-ghost" href="' + esc(map) + '" target="_blank" rel="noopener">' + icon('map-trifold') + '지도에서 보기</a></div>' : '') +
      (P['공지'] ? '<p class="quote">' + esc(P['공지']) + '</p>' : '') +
      '<div class="callout">' + icon('car') + '<p><b>차는 뒤풀이 전에 빼면 아껴요.</b> 교내에 하루 종일 두면 최대 24,000원이에요. <a href="#parking" data-scroll="parking">주차 요금 보기</a></p></div>';
  }

  /* ───────── 전체 그리기 ───────── */
  function renderAll() {
    M = build();
    renderTicker(); renderNotices(); renderHero(); renderFlow();
    renderBoard(); renderFilters(); renderSchedule(); renderStandings(); renderBracket(); renderRules();
    renderScorers(); renderTeams(); renderGoods(); renderFood(); renderParty();
  }
  function tick() { // 1분 단위로 바뀌는 것들 (남은 시간, 흐름)
    if (!M) return;
    renderHero(); renderFlow(); renderBoard(); if (!M.reveal) renderTeams();
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
    $('#board').innerHTML = '<div class="empty" style="grid-column:1/-1"><b>시트를 불러오지 못했어요</b>구글 시트 공유가 "링크가 있는 모든 사용자 · 뷰어"인지, config.js의 SHEET_ID가 맞는지 확인해 주세요. 20초마다 다시 시도해요.</div>';
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
    var a = e.target.closest('[data-tab]');
    if (a) { e.preventDefault(); var tab = a.dataset.tab; if (location.hash !== '#' + tab) { try { history.pushState(null, '', '#' + tab); } catch (x) { /* 무시 */ } } showTab(tab); return; }
    var sc = e.target.closest('[data-scroll]');
    if (sc) { e.preventDefault(); showTab('info', { keepScroll: true }); var el = document.getElementById(sc.dataset.scroll); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
    var pk = e.target.closest('[data-park]'); if (pk) { setPark(pk.dataset.park); return; }
    var pr = e.target.closest('[data-preset]'); if (pr) { var v = pr.dataset.preset.split(','); $('#calcIn').value = v[0]; $('#calcOut').value = v[1]; calc(); return; }
    var sb = e.target.closest('[data-sub]'); if (sb) { showSub(sb.dataset.sub); return; }
    var fl = e.target.closest('[data-filter]'); if (fl) { ui.filter = fl.dataset.filter; renderFilters(); renderSchedule(); return; }
    if (e.target.closest('#ticker') || e.target.closest('[data-open="notices"]')) { openSheet(); return; }
    var z = e.target.closest('[data-zoom]');
    if (z) { var zo = $('#zoom'); $('#zoomImg').src = z.dataset.zoom; zo.hidden = false; var sc2 = $('.zoom-scroll', zo); setTimeout(function () { sc2.scrollLeft = (sc2.scrollWidth - sc2.clientWidth) / 2; sc2.scrollTop = (sc2.scrollHeight - sc2.clientHeight) / 2; }, 30); $('.zoom-close').focus(); return; }
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
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'mine') { ui.mine = e.target.value; store.set('mine', ui.mine); renderFilters(); renderSchedule(); renderStandings(); renderTeams(); }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'calcIn' || e.target.id === 'calcOut') calc(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlays(); });
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshNow(); else schedule(); });

  /* 고정 영역 높이 → 스크롤 여백 */
  function measure() { var s = $('#stick'); if (s) document.documentElement.style.setProperty('--stick-h', s.offsetHeight + 'px'); }
  window.addEventListener('resize', measure);

  /* ───────── 시작 ───────── */
  setPark(ui.park); calc(); measure(); fromHash();
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
})();
