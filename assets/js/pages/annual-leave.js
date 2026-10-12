import { annualLeave, annualLeavePay, won, ANNUAL_LEAVE_APPLIES_UNDER_5 } from "../calc.js";
import { $, num, setupMoneyInputs, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const f = form.elements;

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parse = (v) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
const days = (n) => `${Number(n.toFixed(2)).toLocaleString("ko-KR")}일`;

const today = new Date();
f.asOf.value = iso(today);
f.hire.value = iso(new Date(today.getFullYear() - 2, today.getMonth(), today.getDate()));
const saveUrl = syncUrl(form);

function render() {
  if (!f.hire.value || !f.asOf.value) return;
  const hire = parse(f.hire.value), asOf = parse(f.asOf.value);
  if (asOf < hire) {
    $("#result").innerHTML = `<p class="warn" style="margin:0">기준일은 입사일보다 같거나 뒤여야 해요.</p>`;
    $("#history").innerHTML = "";
    return;
  }
  if (f.size.value === "small" && !ANNUAL_LEAVE_APPLIES_UNDER_5) {
    $("#result").innerHTML = `
      <div class="result-head"><div class="label">법정 연차</div><div class="big">적용 대상 아님</div>
      <div class="sub">상시 5인 미만 사업장은 근로기준법 연차 규정이 적용되지 않아요</div></div>
      <p class="notice">근로계약서나 취업규칙에 연차를 정했다면 그 내용대로 받을 수 있어요. 아래 내역은 5인 이상 사업장이라면 받았을 연차예요.</p>`;
  }
  const basis = f.basis.value;
  const r = annualLeave({ hire, asOf, basis });
  const used = Math.max(0, num(f.used));
  const remaining = Math.max(0, r.validDays - used);
  const wage = num(f.wage);
  const years = Math.floor((r.serviceDays - 1) / 365.25);

  // 회계연도 기준이면 퇴사 시 입사일 기준과 비교
  let compare = "";
  if (basis === "fiscal") {
    const byHire = annualLeave({ hire, asOf, basis: "hire" }).totalEarned;
    const diff = Math.round((byHire - r.totalEarned) * 100) / 100;
    compare = diff > 0
      ? `<p class="notice">입사일 기준으로는 지금까지 ${days(byHire)}이 생겨요. 이 날 퇴사한다면 <strong>${days(diff)}분</strong>을 수당으로 정산받을 수 있어요.</p>`
      : `<p class="notice">입사일 기준(${days(byHire)})보다 같거나 많이 받았어요. 퇴사 시 추가 정산은 없어요.</p>`;
  }

  if (!(f.size.value === "small" && !ANNUAL_LEAVE_APPLIES_UNDER_5)) {
    $("#result").innerHTML = `
      <div class="result-head">
        <div class="label">지금 쓸 수 있는 연차</div>
        <div class="big">${days(remaining)}</div>
        <div class="sub">근속 ${years}년 · 재직 ${r.serviceDays.toLocaleString("ko-KR")}일 · ${basis === "hire" ? "입사일" : "회계연도"} 기준</div>
      </div>
      <ul class="rows">${rows([
        ["소멸 전 연차", days(r.validDays), "", "아직 기한이 남은 것"],
        ["이미 쓴 연차", `− ${days(used)}`],
        ["남은 연차", days(remaining), "total"],
        ...(wage ? [["남은 연차 수당", won(annualLeavePay(wage, remaining)), "", `1일 ${won(annualLeavePay(wage, 1))}`]] : []),
        ["입사 후 총 발생", days(r.totalEarned), "", `월 개근 ${days(r.monthDays)} + 연차 ${days(r.yearDays)}`],
        ["다음 연차", r.next ? `${fmt(r.next.date)} · ${days(r.next.days)}` : "-", "", r.next ? r.next.label : ""],
      ])}</ul>
      ${compare}
      ${used > r.validDays ? `<p class="notice warn">쓴 연차가 남아있는 연차보다 많아요.</p>` : ""}
      <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
    setupShare($("#share"), () => `입사 ${fmt(hire)} · 지금 쓸 수 있는 연차 ${days(remaining)} (총 발생 ${days(r.totalEarned)})`);
  }

  // 발생 내역 (최근 순)
  const list = [...r.earned].reverse().map((g) => {
    const state = g.expires > asOf ? "사용 가능" : "소멸";
    return `<tr><td>${fmt(g.date)}</td><td>${g.label}</td><td>${days(g.days)}</td><td>${fmt(g.expires)}</td><td>${state}</td></tr>`;
  }).join("");
  $("#history").innerHTML = r.earned.length
    ? `<div class="table-wrap" style="max-height:420px"><table><thead><tr><th>발생일</th><th>내용</th><th>일수</th><th>소멸일</th><th>상태</th></tr></thead><tbody>${list}</tbody></table></div>
       <p class="hint" style="font-size:13px;color:var(--muted)">매달 개근, 1년 80% 이상 출근을 가정했어요.</p>`
    : `<p class="lead" style="margin:0">아직 발생한 연차가 없어요. 첫 연차는 ${r.next ? fmt(r.next.date) : "-"}에 생겨요.</p>`;
  saveUrl();
}

setupMoneyInputs(form, render);
render();
