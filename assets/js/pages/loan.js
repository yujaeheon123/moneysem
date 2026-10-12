import { loan, won, koreanWon } from "../calc.js";
import { $, num, setupMoneyInputs, setupChips, syncUrl, rows, setupShare } from "../ui.js";

const form = $("#form");
const f = form.elements;
const saveUrl = syncUrl(form);
const METHODS = { "equal-payment": "원리금균등", "equal-principal": "원금균등", bullet: "만기일시" };

function render() {
  const principal = num(f.principal) * 10_000;
  const rate = num(f.rate);
  const months = Math.round(num(f.years) * 12);
  if (!principal || !months || months > 600 || rate > 100) {
    $("#result").innerHTML = `<p class="lead" style="margin:0">대출 금액과 기간(50년 이내), 금리를 확인해 주세요.</p>`;
    return;
  }
  const method = f.method.value;
  const r = loan({ principal, annualRate: rate, months, method });
  const last = r.schedule.at(-1);
  const head = method === "equal-principal" ? "첫 달 상환액" : method === "bullet" ? "매달 내는 이자" : "매달 상환액";
  $("#result").innerHTML = `
    <div class="result-head">
      <div class="label">${METHODS[method]} · ${head}</div>
      <div class="big">${won(r.firstPayment)}</div>
      <div class="sub">${method === "equal-principal" ? `마지막 달 ${won(last.payment)}까지 줄어요` : method === "bullet" ? `만기에 원금 ${koreanWon(principal)} 상환` : `${months}개월 동안 같은 금액`}</div>
    </div>
    <ul class="rows">${rows([
      ["대출 원금", won(principal)],
      ["총 이자", won(r.totalInterest), "", `원금의 ${((r.totalInterest / principal) * 100).toFixed(1)}%`],
      ["총 상환액", won(r.totalPayment), "total"],
    ])}</ul>
    <div class="actions"><button class="btn primary" type="button" id="share">결과 공유하기</button></div>`;
  setupShare($("#share"), () => `${koreanWon(principal)} ${rate}% ${num(f.years)}년 ${METHODS[method]}: ${head} ${won(r.firstPayment)}, 총 이자 ${koreanWon(r.totalInterest)}`);

  // 방식별 비교
  const cmp = Object.entries(METHODS).map(([m, name]) => {
    const x = loan({ principal, annualRate: rate, months, method: m });
    return `<tr${m === method ? ' style="font-weight:700"' : ""}><td>${name}</td><td>${won(x.firstPayment)}</td><td>${won(x.totalInterest)}</td></tr>`;
  }).join("");
  $("#compare").innerHTML = `<div class="table-wrap"><table><thead><tr><th>방식</th><th>첫 달 상환액</th><th>총 이자</th></tr></thead><tbody>${cmp}</tbody></table></div>`;

  // 스케줄 (길면 연 단위 요약 + 첫 12개월)
  const yearly = [];
  for (let y = 0; y < Math.ceil(months / 12); y++) {
    const part = r.schedule.slice(y * 12, y * 12 + 12);
    yearly.push(`<tr><td>${y + 1}년차</td><td>${won(part.reduce((s, x) => s + x.principal, 0))}</td><td>${won(part.reduce((s, x) => s + x.interest, 0))}</td><td>${won(part.at(-1).balance)}</td></tr>`);
  }
  const monthly = r.schedule.slice(0, 12).map((x) =>
    `<tr><td>${x.month}회</td><td>${won(x.payment)}</td><td>${won(x.principal)}</td><td>${won(x.interest)}</td><td>${won(x.balance)}</td></tr>`).join("");
  $("#schedule").innerHTML = `
    <h3 style="margin-top:0">처음 12개월</h3>
    <div class="table-wrap"><table><thead><tr><th>회차</th><th>상환액</th><th>원금</th><th>이자</th><th>잔액</th></tr></thead><tbody>${monthly}</tbody></table></div>
    <h3>연도별 요약</h3>
    <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>기간</th><th>갚은 원금</th><th>낸 이자</th><th>남은 원금</th></tr></thead><tbody>${yearly.join("")}</tbody></table></div>`;
  saveUrl();
}

setupMoneyInputs(form, render);
setupChips(form);
render();
