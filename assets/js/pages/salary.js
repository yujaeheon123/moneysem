import { salary, won, koreanWon } from "../calc.js";
import { $, num, setupMoneyInputs, setupChips, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const out = $("#result");
const saveUrl = syncUrl(form);
let last;

function render() {
  const f = form.elements;
  const annual = num(f.annual) * 10_000;
  if (!annual) { out.innerHTML = `<p class="lead" style="margin:0">연봉을 입력해 주세요.</p>`; return; }
  const r = (last = salary({
    annual, nonTaxMonthly: num(f.nonTax), family: +f.family.value, children: +f.children.value,
    includesSeverance: f.sev.value === "1",
  }));
  out.innerHTML = `
    <div class="result-head">
      <div class="label">월 예상 실수령액</div>
      <div class="big">${won(r.net)}</div>
      <div class="sub">연 ${koreanWon(r.annualNet)} · 월급(세전) ${won(r.monthly)}</div>
    </div>
    <ul class="rows">${rows([
      ["국민연금", won(r.pension), "", "4.75%"],
      ["건강보험", won(r.health), "", "3.595%"],
      ["장기요양보험", won(r.longTermCare), "", "건보료의 13.14%"],
      ["고용보험", won(r.employment), "", "0.9%"],
      ["소득세", won(r.incomeTax), "", "간이세액표"],
      ["지방소득세", won(r.localTax), "", "소득세의 10%"],
      ["공제 합계", won(r.deductions), "total"],
    ])}</ul>
    <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
  setupShare($("#share"), () => `연봉 ${koreanWon(annual)} 실수령액은 월 ${won(r.net)}`);
  saveUrl();
}

setupMoneyInputs(form, render);
setupChips(form);
render();
