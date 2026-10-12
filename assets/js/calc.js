// 머니셈 계산 로직 — 사이트와 안드로이드 앱이 함께 쓰고, tests/calc.test.mjs 로 검증한다.
// 요율은 매년 바뀌므로 RATES만 고치면 되도록 한곳에 모았다.
import { TAX_TABLE, TAX_AT_10M } from "./tax-table.js";

export const RATES = {
  year: 2026,
  // 국민연금 9.5% (근로자 4.75%) — 2026년 연금개혁으로 9% → 9.5%
  pension: 0.0475,
  // 국민연금 기준소득월액 상·하한 (2026.7 ~ 2027.6)
  pensionBaseMin: 410_000,
  pensionBaseMax: 6_590_000,
  // 건강보험 7.19% (근로자 3.595%), 근로자 부담 월 상한 = 보험료 상한 9,008,340원의 절반
  health: 0.03595,
  healthMaxEmployee: 4_504_170,
  // 장기요양보험료 = 건강보험료 × (0.9448% / 7.19%)  ≒ 13.14%
  longTermCare: 0.9448 / 7.19,
  // 고용보험 실업급여 근로자 0.9%
  employment: 0.009,
  // 2026년 최저임금
  minimumWage: 10_320,
  // 이자소득세 14% + 지방소득세 1.4%
  interestTax: 0.154,
};

/** 10원 미만 절사 (보험료·원천세 실무 방식) */
// 1e-6: 3,000,000 × 0.009 = 26999.999… 같은 부동소수점 오차 보정
export const floor10 = (n) => Math.floor(n / 10 + 1e-6) * 10;

// ------------------------------------------------------------------ 4대보험
export function socialInsurance(monthlyTaxable) {
  const m = Math.max(0, monthlyTaxable);
  const pensionBase = Math.min(
    Math.max(Math.floor(m / 1000) * 1000, RATES.pensionBaseMin),
    RATES.pensionBaseMax,
  );
  const pension = m > 0 ? floor10(pensionBase * RATES.pension) : 0;
  const health = Math.min(floor10(m * RATES.health), RATES.healthMaxEmployee);
  const longTermCare = floor10(health * RATES.longTermCare);
  const employment = floor10(m * RATES.employment);
  return { pension, health, longTermCare, employment, total: pension + health + longTermCare + employment };
}

// ------------------------------------------------------------------ 근로소득 원천징수 (간이세액표)
function tableTax(monthly, family) {
  const col = family - 1; // 0 ~ 10
  const k = monthly / 1000; // 천원 단위
  if (k < TAX_TABLE[0][0]) return 0;
  if (k < 10_000) {
    // 구간이 오름차순이라 이진 탐색
    let lo = 0, hi = TAX_TABLE.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (TAX_TABLE[mid][0] <= k) lo = mid; else hi = mid - 1;
    }
    return TAX_TABLE[lo][2 + col];
  }
  const base = TAX_AT_10M[col];
  const m = monthly;
  if (m <= 10_000_000) return base;
  if (m <= 14_000_000) return base + (m - 10_000_000) * 0.98 * 0.35 + 25_000;
  if (m <= 28_000_000) return base + 1_397_000 + (m - 14_000_000) * 0.98 * 0.38;
  if (m <= 30_000_000) return base + 6_610_600 + (m - 28_000_000) * 0.98 * 0.40;
  if (m <= 45_000_000) return base + 7_394_600 + (m - 30_000_000) * 0.40;
  if (m <= 87_000_000) return base + 13_394_600 + (m - 45_000_000) * 0.42;
  return base + 31_034_600 + (m - 87_000_000) * 0.45;
}

/** 8세 이상 20세 이하 자녀 공제액 (간이세액표 비고 3) */
export function childDeduction(children) {
  if (children <= 0) return 0;
  if (children === 1) return 20_830;
  return 45_830 + Math.max(0, children - 2) * 33_330;
}

/**
 * 월 근로소득세(원천징수액)
 * @param monthlyTaxable 비과세 제외 월급여
 * @param family 공제대상가족 수 (본인 포함, 1 이상)
 * @param children 8세 이상 20세 이하 자녀 수
 * @param ratio 원천징수 비율 80 | 100 | 120
 */
export function incomeTax(monthlyTaxable, family = 1, children = 0, ratio = 100) {
  family = Math.max(1, Math.floor(family));
  let tax;
  if (family <= 11) {
    tax = tableTax(monthlyTaxable, family);
  } else {
    // 비고 4: 11명 초과
    const t11 = tableTax(monthlyTaxable, 11);
    const t10 = tableTax(monthlyTaxable, 10);
    tax = t11 - (t10 - t11) * (family - 11);
  }
  tax = Math.max(0, tax - childDeduction(children));
  return floor10((tax * ratio) / 100);
}

// ------------------------------------------------------------------ 연봉 실수령액
export function salary({ annual, nonTaxMonthly = 200_000, family = 1, children = 0, ratio = 100, includesSeverance = false }) {
  const monthly = annual / (includesSeverance ? 13 : 12);
  const nonTax = Math.min(nonTaxMonthly, monthly);
  const taxable = monthly - nonTax;
  const ins = socialInsurance(taxable);
  const tax = incomeTax(taxable, family, children, ratio);
  const localTax = floor10(tax * 0.1);
  const deductions = ins.total + tax + localTax;
  const net = Math.floor(monthly - deductions);
  return {
    monthly: Math.floor(monthly), taxable: Math.floor(taxable), ...ins, insuranceTotal: ins.total,
    incomeTax: tax, localTax, deductions, net, annualNet: net * 12,
  };
}

// ------------------------------------------------------------------ 퇴직금
const DAY = 86_400_000;
const toUTC = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** 기준일로부터 n개월 전 같은 날짜 (말일 보정) */
export function monthsBefore(date, n) {
  const y = date.getFullYear(), m = date.getMonth() - n, d = date.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, last));
}

/**
 * @param start 입사일
 * @param end 퇴직일 (마지막 근무일의 다음 날)
 * @param wages3m 퇴직 전 3개월 임금 총액(세전)
 * @param annualBonus 최근 1년 상여금 총액
 * @param annualLeavePay 최근 1년 연차수당
 */
export function severance({ start, end, wages3m, annualBonus = 0, annualLeavePay = 0 }) {
  const serviceDays = Math.round((toUTC(end) - toUTC(start)) / DAY);
  const periodDays = Math.round((toUTC(end) - toUTC(monthsBefore(end, 3))) / DAY);
  const bonusShare = (annualBonus * 3) / 12;
  const leaveShare = (annualLeavePay * 3) / 12;
  const avgDailyWage = periodDays > 0 ? (wages3m + bonusShare + leaveShare) / periodDays : 0;
  const amount = Math.floor((avgDailyWage * 30 * serviceDays) / 365);
  return { serviceDays, periodDays, bonusShare, leaveShare, avgDailyWage, amount, eligible: serviceDays >= 365 };
}

// ------------------------------------------------------------------ 대출 이자
/**
 * @param method "equal-payment" 원리금균등 | "equal-principal" 원금균등 | "bullet" 만기일시
 */
export function loan({ principal, annualRate, months, method = "equal-payment" }) {
  const r = annualRate / 100 / 12;
  const schedule = [];
  let balance = principal, totalInterestRaw = 0;
  for (let i = 1; i <= months; i++) {
    const interest = balance * r;
    let principalPaid;
    if (method === "equal-payment") {
      const pay = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
      principalPaid = pay - interest;
    } else if (method === "equal-principal") {
      principalPaid = principal / months;
    } else {
      principalPaid = i === months ? principal : 0;
    }
    if (i === months) principalPaid = balance; // 마지막 회차 오차 정리
    balance -= principalPaid;
    totalInterestRaw += interest;
    schedule.push({
      month: i, payment: Math.round(principalPaid + interest), principal: Math.round(principalPaid),
      interest: Math.round(interest), balance: Math.max(0, Math.round(balance)),
    });
  }
  const totalInterest = Math.round(totalInterestRaw); // 회차별 반올림 오차가 쌓이지 않게
  return { schedule, totalInterest, totalPayment: principal + totalInterest, firstPayment: schedule[0]?.payment ?? 0 };
}

// ------------------------------------------------------------------ 예금·적금 이자
/**
 * @param type "deposit" 예금(목돈 한 번) | "savings" 적금(매월 납입)
 * @param amount 예금이면 원금, 적금이면 월 납입액
 * @param compound "simple" 단리 | "monthly" 월복리
 * @param taxRate 이자 과세율 (0.154 일반, 0 비과세 등)
 */
export function savings({ type, amount, annualRate, months, compound = "simple", taxRate = RATES.interestTax }) {
  const r = annualRate / 100 / 12;
  let principal, interest;
  if (type === "deposit") {
    principal = amount;
    interest = compound === "simple" ? amount * r * months : amount * (Math.pow(1 + r, months) - 1);
  } else {
    principal = amount * months;
    if (compound === "simple") {
      interest = amount * r * (months * (months + 1)) / 2; // 1회차는 n개월, 마지막 회차는 1개월 이자
    } else {
      interest = 0;
      for (let k = 1; k <= months; k++) interest += amount * (Math.pow(1 + r, k) - 1);
    }
  }
  interest = Math.floor(interest);
  const tax = floor10(interest * taxRate);
  return { principal, interest, tax, afterTaxInterest: interest - tax, total: principal + interest - tax };
}

// ------------------------------------------------------------------ 주휴수당
export function weeklyHolidayPay({ hourlyWage, weeklyHours }) {
  const eligible = weeklyHours >= 15;
  const holidayHours = eligible ? (Math.min(weeklyHours, 40) / 40) * 8 : 0;
  const weeklyPay = Math.floor(hourlyWage * holidayHours);
  const weeksPerMonth = 365 / 7 / 12; // ≒ 4.345주
  // 고용노동부 방식: 주 40시간이면 (40 + 8) × 4.345 = 208.6 → 209시간
  const monthlyHours = Math.round((weeklyHours + holidayHours) * weeksPerMonth);
  return {
    eligible, holidayHours, weeklyPay,
    monthlyHolidayPay: Math.floor(weeklyPay * weeksPerMonth),
    monthlyWage: Math.floor(hourlyWage * monthlyHours),
    monthlyHours,
    belowMinimum: hourlyWage < RATES.minimumWage,
  };
}

// ------------------------------------------------------------------ 알바 월급
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** 출근~퇴근 사이 야간(22:00~06:00) 근무 분. 자정을 넘기는 근무 지원 */
export function nightMinutes(start, end) {
  let s = toMin(start), e = toMin(end);
  if (e <= s) e += 24 * 60;
  let night = 0;
  // 전날 22시~오늘 6시, 오늘 22시~내일 6시 구간과 겹치는 부분
  for (const [ns, ne] of [[-120, 360], [1320, 1800], [2760, 3240]]) {
    night += Math.max(0, Math.min(e, ne) - Math.max(s, ns));
  }
  return night;
}

/**
 * @param start, end "HH:MM" 출근·퇴근 시각
 * @param breakMin 하루 휴게시간(분) — 야간이 아닌 시간에 쉰다고 가정
 * @param days 1주 근무일 수
 * @param fivePlus 상시 5인 이상 사업장 → 연장·야간 50% 가산
 * @param deduction "none" | "freelance"(3.3%) | "insurance"(4대보험+소득세)
 */
export function partTimePay({ hourlyWage, start, end, breakMin = 0, days, fivePlus = false, deduction = "none" }) {
  let span = toMin(end) - toMin(start);
  if (span <= 0) span += 24 * 60;
  const dailyHours = Math.max(0, span - breakMin) / 60;
  const dailyNight = Math.min(nightMinutes(start, end) / 60, dailyHours);
  const weeklyHours = dailyHours * days;
  // 연장근로: 하루 8시간 초과분 합계와 주 40시간 초과분 중 큰 값
  const overtimeWeekly = Math.max(Math.max(0, dailyHours - 8) * days, Math.max(0, weeklyHours - 40));
  const nightWeekly = dailyNight * days;

  const weeksPerMonth = 365 / 7 / 12;
  const holiday = weeklyHolidayPay({ hourlyWage, weeklyHours: Math.min(weeklyHours, 40) });
  const base = hourlyWage * weeklyHours * weeksPerMonth;
  const holidayPay = holiday.weeklyPay * weeksPerMonth;
  const overtimePay = fivePlus ? hourlyWage * 0.5 * overtimeWeekly * weeksPerMonth : 0;
  const nightPay = fivePlus ? hourlyWage * 0.5 * nightWeekly * weeksPerMonth : 0;
  const gross = Math.floor(base + holidayPay + overtimePay + nightPay);

  let tax = 0, localTax = 0, insurance = 0;
  if (deduction === "freelance") {
    tax = floor10(gross * 0.03);
    localTax = floor10(tax * 0.1);
  } else if (deduction === "insurance") {
    insurance = socialInsurance(gross).total;
    tax = incomeTax(gross, 1);
    localTax = floor10(tax * 0.1);
  }
  const deductions = insurance + tax + localTax;
  return {
    dailyHours, dailyNight, weeklyHours, overtimeWeekly, nightWeekly, holidayEligible: holiday.eligible,
    holidayHours: holiday.holidayHours,
    base: Math.floor(base), holidayPay: Math.floor(holidayPay), overtimePay: Math.floor(overtimePay),
    nightPay: Math.floor(nightPay), gross, insurance, tax, localTax, deductions, net: gross - deductions,
    belowMinimum: hourlyWage < RATES.minimumWage, over52: weeklyHours > 52,
  };
}

// ------------------------------------------------------------------ 연차
// 2026.10 기준: 상시 5인 미만 사업장은 연차휴가(근로기준법 제60조) 미적용 (확대 적용은 정부 추진 중)
export const ANNUAL_LEAVE_APPLIES_UNDER_5 = false;

const sameDay = (y, m, d) => new Date(y, m, d);
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const dayDiff = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);

/**
 * 입사일로부터 n개월(=12n이면 n년)을 다 채운 다음 날 = 연차가 생기는 날.
 * 민법 기간 계산: 해당 월에 같은 날짜가 없으면(1/31 입사 → 2월) 그 달 말일에 기간이 끝나 다음 날 발생.
 */
export function periodCompleteDate(hire, months) {
  const y = hire.getFullYear(), m = hire.getMonth() + months, d = hire.getDate();
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
  return d <= daysIn(ty, tm) ? sameDay(ty, tm, d) : sameDay(ty, tm + 1, 1);
}

/** 근속 n년차(입사 n주년)에 생기는 연차: 15일 + 최초 1년 초과 2년마다 1일, 최대 25일 */
export const annualDaysForYear = (n) => Math.min(25, 15 + Math.floor((n - 1) / 2));

/**
 * 기준일까지 발생한 연차 목록.
 * @param hire 입사일
 * @param asOf 기준일 — 이 날 재직 중이라고 봄 (퇴사했다면 마지막 근무일)
 * @param basis "hire" 입사일 기준 | "fiscal" 회계연도(1월 1일) 기준
 * 매월 개근·연 80% 이상 출근을 가정한다.
 */
export function annualLeave({ hire, asOf, basis = "hire" }) {
  const grants = [];
  const oneYear = periodCompleteDate(hire, 12);
  // 1년 미만: 1개월 개근마다 1일 (최대 11일), 입사 1주년이 되면 소멸 (2020.3.31 개정)
  for (let k = 1; k <= 11; k++) {
    const date = periodCompleteDate(hire, k);
    grants.push({ date, days: 1, kind: "month", label: `${k}개월 개근`, expires: oneYear });
  }
  if (basis === "hire") {
    for (let n = 1; n <= 60; n++) {
      const date = periodCompleteDate(hire, 12 * n);
      grants.push({ date, days: annualDaysForYear(n), kind: "year", label: `${n}년 근속`, expires: periodCompleteDate(hire, 12 * (n + 1)) });
    }
  } else {
    const hy = hire.getFullYear();
    const startsJan1 = hire.getMonth() === 0 && hire.getDate() === 1;
    for (let y = hy + 1; y <= hy + 60; y++) {
      const date = sameDay(y, 0, 1);
      let days, label;
      if (y === hy + 1 && !startsJan1) {
        // 입사 첫해 근무일수 비례: 15 × (입사일~12/31 일수) / 365
        const worked = dayDiff(hire, sameDay(hy + 1, 0, 1));
        days = Math.round((15 * worked * 100) / 365) / 100;
        label = `${hy}년 근무 ${worked}일 비례`;
      } else {
        const n = y - hy; // 첫해(일부)를 1년으로 셈 → 입사일 기준보다 불리하지 않음
        days = annualDaysForYear(n);
        label = `${y}년분`;
      }
      grants.push({ date, days, kind: "year", label, expires: sameDay(y + 1, 0, 1) });
    }
  }
  grants.sort((a, b) => a.date - b.date);
  const earned = grants.filter((g) => g.date <= asOf);
  const valid = earned.filter((g) => g.expires > asOf);
  const next = grants.find((g) => g.date > asOf);
  const sum = (list) => Math.round(list.reduce((s, g) => s + g.days, 0) * 100) / 100;
  return {
    serviceDays: dayDiff(hire, asOf) + 1, // 입사일과 기준일 포함
    earned, totalEarned: sum(earned), valid, validDays: sum(valid), next,
    monthDays: sum(earned.filter((g) => g.kind === "month")), yearDays: sum(earned.filter((g) => g.kind === "year")),
  };
}

/** 미사용 연차수당 = 통상시급 × 8시간 × 남은 일수 (통상시급 = 월 통상임금 ÷ 209시간) */
export function annualLeavePay(monthlyOrdinaryWage, days, monthlyHours = 209) {
  return Math.floor((monthlyOrdinaryWage / monthlyHours) * 8 * days);
}

// ------------------------------------------------------------------ 표시용
export const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";

/** 1234567 → "123만 4,567원" 처럼 읽기 쉬운 한국식 금액 */
export function koreanWon(n) {
  n = Math.round(n);
  if (Math.abs(n) < 10_000) return n.toLocaleString("ko-KR") + "원";
  const eok = Math.floor(n / 100_000_000), man = Math.floor((n % 100_000_000) / 10_000), rest = n % 10_000;
  return [eok && `${eok.toLocaleString("ko-KR")}억`, man && `${man.toLocaleString("ko-KR")}만`, rest && rest.toLocaleString("ko-KR")]
    .filter(Boolean).join(" ") + "원";
}
