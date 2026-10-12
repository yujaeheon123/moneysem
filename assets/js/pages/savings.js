import { savings, won, koreanWon } from "../calc.js";
import { $, num, setupMoneyInputs, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const f = form.elements;
const saveUrl = syncUrl(form);

function render() {
  const type = f.type.value;
  $("#amount-label").textContent = type === "deposit" ? "예치 금액" : "월 납입액";
  const amount = num(f.amount), annualRate = num(f.rate), months = Math.round(num(f.months));
  if (!amount || !months || months > 600 || annualRate > 100) {
    $("#result").innerHTML = `<p class="lead" style="margin:0">금액, 금리, 기간(50년 이내)을 확인해 주세요.</p>`;
    return;
  }
  const r = savings({ type, amount, annualRate, months, compound: f.compound.value, taxRate: +f.tax.value });
  $("#result").innerHTML = `
    <div class="result-head">
      <div class="label">만기 수령액 (세후)</div>
      <div class="big">${won(r.total)}</div>
      <div class="sub">${koreanWon(r.total)} · 세후 이자 ${won(r.afterTaxInterest)}</div>
    </div>
    <ul class="rows">${rows([
      [type === "deposit" ? "원금" : `납입 원금 (${months}회)`, won(r.principal)],
      ["세전 이자", won(r.interest)],
      ["이자 과세", `− ${won(r.tax)}`, "", `${(+f.tax.value * 100).toFixed(1)}%`],
      ["세후 이자", won(r.afterTaxInterest), "total", `실질 수익률 연 ${effectiveRate(r, type, amount, months)}%`],
    ])}</ul>
    <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
  setupShare($("#share"), () => `${type === "deposit" ? "예금" : "적금"} ${annualRate}% ${months}개월 → 만기 ${won(r.total)} (세후 이자 ${won(r.afterTaxInterest)})`);
  saveUrl();
}

// 원금이 평균적으로 머문 기간 대비 세후 이자율 (적금은 평균 예치기간이 (n+1)/2개월)
function effectiveRate(r, type, amount, months) {
  const avgBalanceMonths = type === "deposit" ? amount * months : amount * (months * (months + 1)) / 2;
  return ((r.afterTaxInterest / avgBalanceMonths) * 12 * 100).toFixed(2);
}

setupMoneyInputs(form, render);
render();
