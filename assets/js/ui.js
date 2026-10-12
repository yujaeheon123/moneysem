// 계산기 페이지 공통 UI
import { koreanWon } from "./calc.js";

export const $ = (sel, el = document) => el.querySelector(sel);

/** 콤마 포맷 입력칸 → 숫자 */
export const num = (input) => Number(String(input.value).replace(/[^\d.]/g, "")) || 0;

/**
 * data-money 입력칸: 입력하는 동안 콤마를 붙이고, 아래 힌트에 "4,000만원"처럼 읽어준다.
 * data-unit="만원"이면 힌트는 만원 단위로 환산해서 보여준다.
 */
export function setupMoneyInputs(form, onChange) {
  for (const input of form.querySelectorAll("input[data-money]")) {
    const hint = input.closest(".field")?.querySelector(".hint");
    const mult = input.dataset.money === "man" ? 10_000 : 1;
    const update = () => {
      const caret = input.value.length - input.selectionStart;
      const raw = String(input.value).replace(/[^\d]/g, "");
      input.value = raw ? Number(raw).toLocaleString("ko-KR") : "";
      if (document.activeElement === input) {
        const pos = Math.max(0, input.value.length - caret);
        input.setSelectionRange(pos, pos);
      }
      if (hint && !hint.dataset.static) hint.textContent = raw ? koreanWon(Number(raw) * mult) : "";
    };
    input.addEventListener("input", () => { update(); onChange(); });
    update();
  }
  form.addEventListener("input", (e) => { if (!e.target.dataset.money) onChange(); });
  form.addEventListener("change", onChange);
  form.addEventListener("submit", (e) => { e.preventDefault(); onChange(); });
}

/** 빠른 입력 칩: <div class="chips" data-for="annual"><button data-v="4000">4천만</button></div> */
export function setupChips(form) {
  for (const box of form.querySelectorAll(".chips[data-for]")) {
    box.addEventListener("click", (e) => {
      const v = e.target.closest("button")?.dataset.v;
      if (v === undefined) return;
      const input = form.elements[box.dataset.for];
      input.value = v;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

/** 폼 값을 URL(?a=1&b=2)에 저장 → 링크 공유·새로고침해도 유지 */
export function syncUrl(form) {
  const params = new URLSearchParams(location.search);
  for (const el of form.elements) {
    if (!el.name || !params.has(el.name)) continue;
    const v = params.get(el.name);
    if (el.type === "radio") el.checked = el.value === v;
    else if (el.type === "checkbox") el.checked = v === "1";
    else el.value = el.dataset.money ? Number(v).toLocaleString("ko-KR") : v;
  }
  return () => {
    const p = new URLSearchParams();
    for (const el of form.elements) {
      if (!el.name || (el.type === "radio" && !el.checked)) continue;
      if (el.type === "checkbox") p.set(el.name, el.checked ? "1" : "0");
      else if (el.value !== "") p.set(el.name, el.dataset.money ? num(el) : el.value);
    }
    history.replaceState(null, "", `${location.pathname}?${p}`);
  };
}

/** [["국민연금", 123], ...] → <li> 목록 */
export function rows(list) {
  return list.map(([label, value, cls = "", note = ""]) =>
    `<li class="${cls}"><span>${label}${note ? ` <span class="muted">${note}</span>` : ""}</span><span>${value}</span></li>`).join("");
}

/** 공유 버튼: 모바일은 공유 시트, PC는 링크 복사 */
export function setupShare(button, getText) {
  button?.addEventListener("click", async () => {
    const data = { title: document.title, text: getText(), url: location.href };
    try {
      if (window.AndroidApp) {
        // 앱 내부 주소 대신 실제 웹사이트 주소(canonical)로 공유
        const site = document.querySelector('link[rel="canonical"]')?.href ?? "";
        window.AndroidApp.share(`${data.text}\n${site}${location.search}`);
      }
      else if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
        const old = button.textContent;
        button.textContent = "링크를 복사했어요";
        setTimeout(() => (button.textContent = old), 1500);
      }
    } catch { /* 사용자가 공유를 취소함 */ }
  });
}
