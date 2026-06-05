/**
 * NexusBank — loan calculator (APR table, amortization, protection add-on).
 */
(function () {
  'use strict';

  const APR_TABLE = [
    [12, 20.0],
    [24, 19.2],
    [36, 18.5],
    [48, 17.9],
    [60, 17.3],
    [72, 16.8],
    [84, 16.3],
    [96, 15.9],
    [108, 15.7],
    [120, 15.5],
  ];

  const TERM_OPTIONS = APR_TABLE.map(([months]) => months);
  const PROTECTION_ADDON = 0.5;
  const LOAN_AMOUNT_MIN = 1000;
  const LOAN_AMOUNT_MAX = 40000;
  const DEFAULT_LOAN_AMOUNT = 20000;
  const DEFAULT_TERM_MONTHS = 60;
  const DEFAULT_PROTECTION = false;

  function clampLoanAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return DEFAULT_LOAN_AMOUNT;
    return Math.min(LOAN_AMOUNT_MAX, Math.max(LOAN_AMOUNT_MIN, n));
  }

  function clampTermMonths(months) {
    const n = Math.round(Number(months));
    if (!Number.isFinite(n) || n < 1) return DEFAULT_TERM_MONTHS;
    return n;
  }

  function interpolateBaseRate(termMonths) {
    const months = clampTermMonths(termMonths);

    const exact = APR_TABLE.find(([m]) => m === months);
    if (exact) return exact[1];

    if (months <= APR_TABLE[0][0]) return APR_TABLE[0][1];
    if (months >= APR_TABLE[APR_TABLE.length - 1][0]) return APR_TABLE[APR_TABLE.length - 1][1];

    for (let i = 0; i < APR_TABLE.length - 1; i += 1) {
      const [m1, r1] = APR_TABLE[i];
      const [m2, r2] = APR_TABLE[i + 1];
      if (months >= m1 && months <= m2) {
        const ratio = (months - m1) / (m2 - m1);
        return r1 + (r2 - r1) * ratio;
      }
    }

    return APR_TABLE[APR_TABLE.length - 1][1];
  }

  function getInterestRate(termMonths, protectionEnabled) {
    const base = interpolateBaseRate(termMonths);
    const rate = base + (protectionEnabled ? PROTECTION_ADDON : 0);
    return Math.round(rate * 10) / 10;
  }

  function formatCurrency(amount) {
    const rounded = Math.round(Number(amount) || 0);
    return '€' + rounded.toLocaleString('en-US');
  }

  function formatTerm(months) {
    const total = clampTermMonths(months);
    const years = Math.floor(total / 12);
    const remainingMonths = total % 12;

    if (years === 0) {
      return `${total} month${total === 1 ? '' : 's'}`;
    }

    if (remainingMonths === 0) {
      return `${years} year${years === 1 ? '' : 's'}`;
    }

    const yearPart = `${years} year${years === 1 ? '' : 's'}`;
    const monthPart = `${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`;
    return `${yearPart} ${monthPart}`;
  }

  function roundNearest(value) {
    return Math.round(Number(value) || 0);
  }

  function calculateLoan(loanAmount, termMonths, protectionEnabled) {
    const principal = clampLoanAmount(loanAmount);
    const numberOfPayments = clampTermMonths(termMonths);
    const protection = Boolean(protectionEnabled);
    const interestRate = getInterestRate(numberOfPayments, protection);
    const monthlyRate = interestRate / 100 / 12;

    let monthlyPayment;
    if (monthlyRate === 0) {
      monthlyPayment = principal / numberOfPayments;
    } else {
      const factor = Math.pow(1 + monthlyRate, numberOfPayments);
      monthlyPayment = (principal * (monthlyRate * factor)) / (factor - 1);
    }

    const totalRepayment = monthlyPayment * numberOfPayments;
    const totalInterest = totalRepayment - principal;

    const monthlyPaymentRounded = roundNearest(monthlyPayment);
    const totalRepaymentRounded = roundNearest(totalRepayment);
    const totalInterestRounded = roundNearest(totalInterest);

    return {
      monthlyPayment: monthlyPaymentRounded,
      totalRepayment: totalRepaymentRounded,
      totalInterest: totalInterestRounded,
      interestRate,
      termDisplay: formatTerm(numberOfPayments),
      monthlyPaymentFormatted: formatCurrency(monthlyPaymentRounded),
      totalRepaymentFormatted: formatCurrency(totalRepaymentRounded),
      interestRateFormatted: `${interestRate.toFixed(1)}% APR`,
    };
  }

  const DEFAULT_SELECTORS = {
    loanAmount: '#loanAmount',
    termMonths: '#termMonths',
    protectionEnabled: '#protectionEnabled',
    monthlyPayment: '#monthlyPayment',
    totalRepayment: '#totalRepayment',
    totalInterest: '#totalInterest',
    interestRate: '#interestRate',
    termDisplay: '#termDisplay',
    monthlyPaymentFormatted: '#monthlyPaymentFormatted',
    totalRepaymentFormatted: '#totalRepaymentFormatted',
    interestRateFormatted: '#interestRateFormatted',
  };

  function readControlValue(el) {
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function updateLoanDisplay(result, selectors) {
    setText(document.querySelector(selectors.monthlyPayment), String(result.monthlyPayment));
    setText(document.querySelector(selectors.totalRepayment), String(result.totalRepayment));
    setText(document.querySelector(selectors.totalInterest), String(result.totalInterest));
    setText(document.querySelector(selectors.interestRate), result.interestRate.toFixed(1));
    setText(document.querySelector(selectors.termDisplay), result.termDisplay);
    setText(document.querySelector(selectors.monthlyPaymentFormatted), result.monthlyPaymentFormatted);
    setText(document.querySelector(selectors.totalRepaymentFormatted), result.totalRepaymentFormatted);
    setText(document.querySelector(selectors.interestRateFormatted), result.interestRateFormatted);
  }

  function getCurrentLoanInputs(selectors) {
    const amountEl = document.querySelector(selectors.loanAmount);
    const termEl = document.querySelector(selectors.termMonths);
    const protectionEl = document.querySelector(selectors.protectionEnabled);

    const loanAmount = clampLoanAmount(readControlValue(amountEl) ?? DEFAULT_LOAN_AMOUNT);
    const termMonths = clampTermMonths(readControlValue(termEl) ?? DEFAULT_TERM_MONTHS);
    const protectionEnabled =
      protectionEl != null ? Boolean(readControlValue(protectionEl)) : DEFAULT_PROTECTION;

    return { loanAmount, termMonths, protectionEnabled };
  }

  function recalculateAndUpdate(selectors) {
    const inputs = getCurrentLoanInputs(selectors);
    const result = calculateLoan(inputs.loanAmount, inputs.termMonths, inputs.protectionEnabled);
    updateLoanDisplay(result, selectors);
    return result;
  }

  function initLoanCalculator(options) {
    const selectors = { ...DEFAULT_SELECTORS, ...(options?.selectors || {}) };
    const amountEl = document.querySelector(selectors.loanAmount);
    const termEl = document.querySelector(selectors.termMonths);
    const protectionEl = document.querySelector(selectors.protectionEnabled);

    if (!amountEl && !termEl && !protectionEl) {
      return null;
    }

    const onChange = () => recalculateAndUpdate(selectors);

    if (amountEl) {
      amountEl.addEventListener('input', onChange);
      amountEl.addEventListener('change', onChange);
    }
    if (termEl) {
      termEl.addEventListener('input', onChange);
      termEl.addEventListener('change', onChange);
    }
    if (protectionEl) {
      protectionEl.addEventListener('change', onChange);
    }

    return onChange();
  }

  window.NexusLoanCalculator = {
    APR_TABLE,
    TERM_OPTIONS,
    LOAN_AMOUNT_MIN,
    LOAN_AMOUNT_MAX,
    DEFAULT_LOAN_AMOUNT,
    DEFAULT_TERM_MONTHS,
    DEFAULT_PROTECTION,
    formatCurrency,
    formatTerm,
    getInterestRate,
    calculateLoan,
    initLoanCalculator,
  };

  document.addEventListener('DOMContentLoaded', () => {
    initLoanCalculator();
  });
})();
