import { weeklyHolidayPay, won, RATES } from "../calc.js";
import { $, num, setupMoneyInputs, setupChips, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const f = form.elements;
const saveUrl = syncUrl(form);
const fmtH = (h) => `${Number(h.toFixed(2)).toLocaleString("ko-KR")}시간`;

function render() {
  const hourlyWage = num(f.wage);
  const daily = Math.min(num(f.hours), 24);
  const weeklyHours = daily * +f.days.value;
  if (!hourlyWage || !weeklyHours) {
    $("#result").innerHTML = `<p class="lead" style="margin:0">시급과 근무시간을 입력해 주세요.</p>`;
    return;
  }
  const r = weeklyHolidayPay({ hourlyWage, weeklyHours });
  $("#result").innerHTML = `
    <div class="result-head">
      <div class="label">1주 주휴수당</div>
      <div class="big">${r.eligible ? won(r.weeklyPay) : "지급 대상 아님"}</div>
      <div class="sub">${r.eligible ? `주휴시간 ${fmtH(r.holidayHours)}` : "1주 근무시간이 15시간 미만이에요"}</div>
    </div>
    <ul class="rows">${rows([
      ["1주 근무시간", fmtH(weeklyHours)],
      ["1주 급여 (주휴 제외)", won(hourlyWage * weeklyHours)],
      ["월 주휴수당", won(r.monthlyHolidayPay), "", "× 4.345주"],
      ["월 유급시간", `${r.monthlyHours}시간`],
      ["주휴수당 포함 월급", won(r.monthlyWage), "total", "세전"],
    ])}</ul>
    ${r.belowMinimum ? `<p class="notice warn">입력한 시급이 ${RATES.year}년 최저시급 ${won(RATES.minimumWage)}보다 낮아요.</p>` : ""}
    ${weeklyHours > 52 ? `<p class="notice warn">1주 근로시간은 연장근로를 포함해 최대 52시간이에요.</p>` : ""}
    <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
  setupShare($("#share"), () => `시급 ${won(hourlyWage)}, 주 ${weeklyHours}시간 → 주휴수당 ${won(r.weeklyPay)}, 월급 ${won(r.monthlyWage)}`);
  saveUrl();
}

setupMoneyInputs(form, render);
setupChips(form);
render();
