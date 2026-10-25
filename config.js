/*
 * ISFC 20주년 풋살대회 사이트 설정
 * ─────────────────────────────────────────────
 * SHEET_ID: 구글 시트 주소에서 /d/ 와 /edit 사이 글자
 *   예) https://docs.google.com/spreadsheets/d/1AbCdEfGh.../edit
 *        → SHEET_ID: "1AbCdEfGh..."
 * 비워두면 화면 확인용 샘플 데이터로 보여요.
 */
window.ISFC_CONFIG = {
  SHEET_ID: "1OOM9syRI9TDO6697E5ZBYjdl8ub5KJqe",

  EVENT_DATE: "2026-10-31",   // 행사 날짜 (D-day, 남은 시간 계산용)
  POLL_FAST_SEC: 20,          // 공지, 경기, 득점 새로고침 간격(초)
  POLL_SLOW_SEC: 120,         // 팀, 선수, 기념품, 안주, 뒤풀이, 설정 새로고침 간격(초)

  // 팀 꾸미기 저장소 (구글 Apps Script 웹앱 주소, …/exec). 비워두면 팀 꾸미기 탭이 '준비 중'으로 보여요.
  // 저장되는 곳: 구글 드라이브의 'ISFC 팀 꾸미기 저장소 (사이트 자동 저장)' 시트
  DECO_URL: "https://script.google.com/macros/s/AKfycbygZZg46ekcn_36BUJiIF1JXI7Ru_DmOOx4Jebi9o14OPTbaoQqKhg13vgAe1Y3aOHm_Q/exec",
  DECO_POLL_SEC: 45,          // 다른 사람이 바꾼 팀 이름·사진을 확인하는 간격(초)

  // 샘플 모드에서만 쓰는 가상의 '현재 시각' (당일 15:05처럼 보이게)
  DEMO_NOW: "2026-10-31T15:05:00+09:00"
};
