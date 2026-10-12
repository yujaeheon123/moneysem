import { severance, won, koreanWon } from "../calc.js";
import { $, num, setupMoneyInputs, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const out = $("#result");
const f = form.elements;

// 기본값: 오늘 퇴직, 3년 전 입사
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = new Date();
f.end.value = iso(today);
f.start.value = iso(new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()));
const saveUrl = syncUrl(form);

$("#monthly-helper").addEventListener("click", (e) => {
  const m = e.target.closest("button")?.dataset.m;
  if (!m) return;
  f.wages3m.value = String(m * 3);
  f.wages3m.dispatchEvent(new Event("input", { bubbles: true }));
});

const parse = (v) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };

function render() {
  if (!f.start.value || !f.end.value) return;
  const start = parse(f.start.value), end = parse(f.end.value);
  if (end <= start) { out.innerHTML = `<p class="warn" style="margin:0">퇴직일은 입사일보다 뒤여야 해요.</p>`; return; }
  const r = severance({ start, end, wages3m: num(f.wages3m), annualBonus: num(f.bonus), annualLeavePay: num(f.leave) });
  const years = Math.floor(r.serviceDays / 365), days = r.serviceDays % 365;
  out.innerHTML = `
    <div class="result-head">
      <div class="label">예상 퇴직금 (세전)</div>
      <div class="big">${r.eligible ? won(r.amount) : "지급 대상 아님"}</div>
      <div class="sub">${r.eligible ? koreanWon(r.amount) : "재직 기간이 1년 미만이에요"}</div>
    </div>
    <ul class="rows">${rows([
      ["재직일수", `${r.serviceDays.toLocaleString("ko-KR")}일`, "", `${years}년 ${days}일`],
      ["3개월 임금 총액", won(num(f.wages3m))],
      ["상여금 반영분", won(r.bonusShare), "", "연간 × 3/12"],
      ["연차수당 반영분", won(r.leaveShare), "", "연간 × 3/12"],
      ["3개월 총 일수", `${r.periodDays}일`],
      ["1일 평균임금", won(r.avgDailyWage)],
      ["퇴직금", r.eligible ? won(r.amount) : "-", "total", "평균임금 × 30 × 재직일수/365"],
    ])}</ul>
    ${r.eligible ? `<p class="notice">퇴직소득세가 원천징수되면 실제 입금액은 조금 줄어들어요.</p>` : ""}
    <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
  setupShare($("#share"), () => `내 예상 퇴직금은 ${won(r.amount)}`);
  saveUrl();
}

setupMoneyInputs(form, render);
render();
