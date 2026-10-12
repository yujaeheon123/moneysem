import { partTimePay, won, RATES } from "../calc.js";
import { $, num, setupMoneyInputs, setupChips, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const f = form.elements;
const saveUrl = syncUrl(form);
const fmtH = (h) => `${Number(h.toFixed(2)).toLocaleString("ko-KR")}시간`;

function render() {
  const hourlyWage = num(f.wage);
  if (!hourlyWage || !f.start.value || !f.end.value) {
    $("#result").innerHTML = `<p class="lead" style="margin:0">시급과 출퇴근 시간을 입력해 주세요.</p>`;
    return;
  }
  const fivePlus = f.size.value === "big";
  const deduction = f.ded.value;
  const shift = { hourlyWage, start: f.start.value, end: f.end.value, breakMin: +f.break.value, days: +f.days.value };
  const r = partTimePay({ ...shift, fivePlus, deduction });
  if (!r.dailyHours) {
    $("#result").innerHTML = `<p class="warn" style="margin:0">휴게시간이 근무시간보다 길어요.</p>`;
    return;
  }
  const list = [
    ["하루 / 1주 근무", `${fmtH(r.dailyHours)} / ${fmtH(r.weeklyHours)}`],
    ["기본급", won(r.base)],
    ["주휴수당", r.holidayEligible ? won(r.holidayPay) : "대상 아님", "", r.holidayEligible ? `주 ${fmtH(r.holidayHours)}` : "주 15시간 미만"],
  ];
  if (fivePlus) {
    list.push(["연장수당", won(r.overtimePay), "", `주 ${fmtH(r.overtimeWeekly)} × 50%`]);
    list.push(["야간수당", won(r.nightPay), "", `주 ${fmtH(r.nightWeekly)} × 50%`]);
  }
  list.push(["세전 월급", won(r.gross), "total"]);
  if (deduction === "freelance") {
    list.push(["사업소득세 3%", `− ${won(r.tax)}`], ["지방소득세 0.3%", `− ${won(r.localTax)}`]);
  } else if (deduction === "insurance") {
    list.push(["4대보험", `− ${won(r.insurance)}`], ["소득세·지방세", `− ${won(r.tax + r.localTax)}`]);
  }
  // 5인 미만인데 야간·연장 근무가 있으면, 5인 이상이었다면 더 받을 금액을 알려줌
  const extra = partTimePay({ ...shift, fivePlus: true }).gross - partTimePay(shift).gross;
  const smallNote = !fivePlus && extra > 0
    ? `<p class="notice">5인 이상 사업장이라면 야간·연장수당으로 월 ${won(extra)}을 더 받아요.</p>` : "";

  $("#result").innerHTML = `
    <div class="result-head">
      <div class="label">한 달 예상 ${deduction === "none" ? "알바비" : "실수령액"}</div>
      <div class="big">${won(r.net)}</div>
      <div class="sub">시급 ${won(hourlyWage)} · 주 ${f.days.value}일 · 월 4.345주 기준</div>
    </div>
    <ul class="rows">${rows(list)}</ul>
    ${smallNote}
    ${r.belowMinimum ? `<p class="notice warn">입력한 시급이 ${RATES.year}년 최저시급 ${won(RATES.minimumWage)}보다 낮아요.</p>` : ""}
    ${r.over52 ? `<p class="notice warn">1주 근로시간은 연장근로를 포함해 최대 52시간이에요.</p>` : ""}
    <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
  setupShare($("#share"), () => `시급 ${won(hourlyWage)}, ${f.start.value}~${f.end.value} 주 ${f.days.value}일 → 한 달 ${won(r.net)}`);
  saveUrl();
}

setupMoneyInputs(form, render);
setupChips(form);
render();
