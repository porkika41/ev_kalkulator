/* Full-year, uniform-income model. 2027 wages are explicit assumptions.
 * Rates, brackets and statutory baselines are isolated in this object. */
const TAX_CONFIG = {
  CHECKED_ON: '2026-10-10', MONTHS_PER_YEAR: 12,
  YEARS: {
    current: { YEAR: 2026, MIN_WAGE: 322800, GUARANTEED_MIN_WAGE: 373200, GENERAL_COST_RATIO: 0.45 },
    draft: { YEAR: 2027, MIN_WAGE_ASSUMPTION: 322800, GUARANTEED_MIN_WAGE_ASSUMPTION: 373200, GENERAL_COST_RATIO: 0.50 }
  },
  KATA: { MONTHLY_TAX: 50000, ANNUAL_LIMIT: 18000000, PENALTY_RATE: 0.40, BENEFIT_BASE: 108000 },
  KATA_DRAFT: {
    MONTHLY_TAX_FULL: 100000, MONTHLY_TAX_SIDE: 50000, ANNUAL_LIMIT: 22000000,
    PENALTY_RATE: 0.40, SUPPLEMENT_RATE: 0.15, CONCENTRATION_LIMIT: 0.50,
    LEGACY_MONTHLY_TAX: 75000, LEGACY_ANNUAL_LIMIT: 18000000,
    BENEFIT_BASE_FULL: 317000, LEGACY_BENEFIT_BASE: 161000
  },
  ATALANYADO: {
    SZJA_RATE: 0.15, TBJ_RATE: 0.185, SZOCHO_RATE: 0.13, EXEMPT_FACTOR: 6,
    SZOCHO_MULTIPLIER: 1, COST_RATIO_80: 0.80, COST_RATIO_RETAIL: 0.90,
    REVENUE_LIMIT_FACTOR: 10, RETAIL_REVENUE_LIMIT_FACTOR: 50
  },
  VSZJA: {
    BUSINESS_SZJA_RATE: 0.09, DIVIDEND_SZJA_RATE: 0.15, DIVIDEND_SZOCHO_RATE: 0.13,
    SZOCHO_CAP_MIN_WAGE_FACTOR: 24, MIN_SZOCHO_MULTIPLIER: 1,
    INCOME_MINIMUM_RATE: 0.02, LOSS_LIMIT_RATIO: 0.50
  },
  HIPA: {
    RATE_DEFAULT: 0.02, MAX_RATE: 0.02, REVENUE_LIMIT: 25000000, RETAIL_FLAT_REVENUE_LIMIT: 120000000,
    TIERS: [{ LIMIT: 12000000, BASE: 2500000 }, { LIMIT: 18000000, BASE: 6000000 }, { LIMIT: Infinity, BASE: 8500000 }]
  }
};
const PARTNER_CONFIG = {
  REVOLUT_BUSINESS_URL: 'https://business.revolut.com/signup?promo=C2B-OCT1-26-AR-H1&ext=koslrzn3&context=C2B_REFERRAL',
  COFFEE_URL: ''
};
const UI_CONFIG = { MONTHLY_REVENUE_MIN: 100000, MONTHLY_REVENUE_MAX: 2500000, MONTHLY_EXPENSE_MAX: 2500000, CHART_SAMPLES: 100, ANNOUNCEMENT_DELAY: 300 };
const DEFAULT_STATE = Object.freeze({
  mode: 'current', kataVersion: 'new', annualRevenue: 9600000, period: 'monthly',
  employment: 'full', clients: 'mixed', b2bShare: 100, largestPayer: 40,
  employerClient: false, excessShare: null, kataEligibility: 'unknown', taxi: false,
  costCategory: 'general', skill: 'guaranteed', monthlyExpenses: 50000, monthlyMaterials: 0,
  hipaMethod: 'simplified', hipaRate: TAX_CONFIG.HIPA.RATE_DEFAULT * 100, towns: 1,
  monthlyWithdrawal: 0, otherIncome: 0, costsLinked: true, deductibleCosts: 600000,
  taxCostMode: 'estimate', paidTaxCosts: 0, profitAdjustment: 0, loss: 0,
  minimumTreatment: 'minimum', comparisonAdjustment: 0, dividendAdjustment: 0,
  futureMin: TAX_CONFIG.YEARS.draft.MIN_WAGE_ASSUMPTION,
  futureGuaranteed: TAX_CONFIG.YEARS.draft.GUARANTEED_MIN_WAGE_ASSUMPTION
});
const REGIMES = [{ id: 'kata', name: 'KATA', color: 'kata' }, { id: 'flat', name: 'Átalányadó', color: 'flat' }, { id: 'vszja', name: 'VSZJA', color: 'vszja' }];
const months = TAX_CONFIG.MONTHS_PER_YEAR;
const amountFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
const preciseFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
const rateFormat = new Intl.NumberFormat('hu-HU', { style: 'percent', maximumFractionDigits: 1 });
const money = value => Number.isFinite(value) ? `${amountFormat.format(value)} Ft` : '—';
const preciseMoney = value => `${preciseFormat.format(value)} Ft`;
const nonnegative = value => Math.max(0, value);
function yearParameters(input) {
  const year = TAX_CONFIG.YEARS[input.mode];
  return { year: year.YEAR, minWage: input.mode === 'draft' ? input.futureMin : year.MIN_WAGE,
    guaranteed: input.mode === 'draft' ? input.futureGuaranteed : year.GUARANTEED_MIN_WAGE, generalRatio: year.GENERAL_COST_RATIO };
}
function costRatio(input) {
  return input.costCategory === '80' ? TAX_CONFIG.ATALANYADO.COST_RATIO_80
    : input.costCategory === '90' ? TAX_CONFIG.ATALANYADO.COST_RATIO_RETAIL : yearParameters(input).generalRatio;
}
function minimumBase(input) { const year = yearParameters(input); return input.skill === 'guaranteed' ? year.guaranteed : year.minWage; }
function payerRatio(input) { return input.clients === 'private' ? 0 : input.b2bShare / 100; }
function kataParameters(input) {
  if (input.mode === 'current') return { monthlyTax: TAX_CONFIG.KATA.MONTHLY_TAX, limit: TAX_CONFIG.KATA.ANNUAL_LIMIT, penaltyRate: TAX_CONFIG.KATA.PENALTY_RATE, isNew: false, name: 'KATA (2026)' };
  const c = TAX_CONFIG.KATA_DRAFT;
  return input.kataVersion === 'legacy'
    ? { monthlyTax: c.LEGACY_MONTHLY_TAX, limit: c.LEGACY_ANNUAL_LIMIT, penaltyRate: c.PENALTY_RATE, isNew: false, name: 'KATA (átmeneti tervezet)' }
    : { monthlyTax: input.employment === 'full' ? c.MONTHLY_TAX_FULL : c.MONTHLY_TAX_SIDE, limit: c.ANNUAL_LIMIT, penaltyRate: c.PENALTY_RATE, isNew: true, name: 'KATA (új tervezet)' };
}
function calculateHipa(input, regime) {
  const c = TAX_CONFIG.HIPA, rate = input.hipaRate / 100;
  const limit = regime === 'flat' && input.costCategory === '90' ? c.RETAIL_FLAT_REVENUE_LIMIT : c.REVENUE_LIMIT;
  const simplified = input.hipaMethod === 'simplified' && input.annualRevenue <= limit;
  const base = simplified ? c.TIERS.find(tier => input.annualRevenue <= tier.LIMIT).BASE * input.towns
    : nonnegative(input.annualRevenue - input.monthlyMaterials * months);
  return { hipa: base * rate, hipaBase: base, hipaMethod: simplified ? 'simplified' : 'normal', hipaFallback: input.hipaMethod === 'simplified' && !simplified };
}
function finishResult(input, values) {
  const totalTax = values.szja + values.tb + values.szocho + values.flatTax + values.penalty + values.supplement + values.hipa;
  const annualCosts = input.monthlyExpenses * months;
  return { ...values, annualRevenue: input.annualRevenue, annualCosts, totalTax,
    afterTaxBeforeCosts: input.annualRevenue - totalTax, cashNet: input.annualRevenue - annualCosts - totalTax,
    effectiveRate: input.annualRevenue ? totalTax / input.annualRevenue : null };
}
function calculateKata(input) {
  const c = kataParameters(input), q = payerRatio(input), notes = [];
  let status = 'eligible', reason = '';
  if (!c.isNew && input.employment !== 'full') { status = 'excluded'; reason = input.employment === 'retired' ? 'Nyugdíjas, kiegészítő tevékenységet folytató EV-ként a régi KATA nem választható.' : 'A régi KATA mellékállásban nem választható.'; }
  else if (!c.isNew && q > 0 && !input.taxi) { status = 'excluded'; reason = 'Kifizetői bevétel: a régi KATA főszabály szerint nem alkalmazható.'; }
  else if (c.isNew && q > 0 && input.employerClient) { status = 'excluded'; reason = 'Munkáltatói kizárás: teljes éves KATA nem számítható.'; }
  else if (input.kataEligibility !== 'yes') { status = input.kataEligibility === 'no' ? 'excluded' : 'unknown'; reason = input.kataEligibility === 'no' ? 'A KATA alapfeltételei nem teljesülnek.' : 'A KATA alapfeltételeinek ellenőrzése szükséges.'; }
  if (c.isNew && q > 0 && input.largestPayer / 100 >= TAX_CONFIG.KATA_DRAFT.CONCENTRATION_LIMIT) notes.push('A kifizetői koncentráció eléri az 50%-ot: a tervezet szerint év végén megszűnne a KATA. Az éves adóteher ettől még számítható.');
  const flatTax = c.monthlyTax * months, excess = nonnegative(input.annualRevenue - c.limit);
  let supplementBase = q * input.annualRevenue, supplementRange = null;
  if (c.isNew && excess > 0) {
    if (q === 0 || q === 1) supplementBase = q * c.limit;
    else if (input.excessShare === null) {
      const low = Math.max(0, q * input.annualRevenue - excess), high = Math.min(q * input.annualRevenue, c.limit);
      supplementRange = [low, high].map(base => nonnegative(base * TAX_CONFIG.KATA_DRAFT.SUPPLEMENT_RATE - flatTax));
      if (Math.abs(supplementRange[1] - supplementRange[0]) < 1e-7) supplementBase = low;
      else if (status === 'eligible') { status = 'uncertain'; reason = 'A 22 millió feletti vegyes bevétel megosztása hiányzik.'; }
    } else {
      supplementBase -= excess * input.excessShare / 100;
      if (supplementBase < -1e-6 || supplementBase > c.limit + 1e-6) {
        if (status === 'eligible') { status = 'uncertain'; reason = 'A keret feletti megosztás nem egyeztethető össze a teljes kifizetői bevétellel.'; }
      }
    }
  }
  const supplement = c.isNew ? nonnegative(supplementBase * TAX_CONFIG.KATA_DRAFT.SUPPLEMENT_RATE - flatTax) : 0;
  const result = finishResult(input, { id: 'kata', name: c.name, status, eligible: status === 'eligible', reason, notes,
    szja: 0, tb: 0, szocho: 0, flatTax, penalty: excess * c.penaltyRate, supplement, ...calculateHipa(input, 'kata') });
  if (status === 'uncertain' && supplementRange) {
    const withoutSupplement = result.totalTax - supplement;
    result.taxRange = supplementRange.map(value => withoutSupplement + value);
    result.netRange = [input.annualRevenue - result.annualCosts - result.taxRange[1], input.annualRevenue - result.annualCosts - result.taxRange[0]];
  }
  return result;
}
function calculateFlat(input) {
  const c = TAX_CONFIG.ATALANYADO, year = yearParameters(input);
  const retired = input.employment === 'retired';
  const income = input.annualRevenue * (1 - costRatio(input)), exemptIncome = year.minWage * c.EXEMPT_FACTOR;
  const taxableIncome = nonnegative(income - exemptIncome), base = input.employment === 'full' ? minimumBase(input) * months : 0;
  const limit = year.minWage * months * (input.costCategory === '90' ? c.RETAIL_REVENUE_LIMIT_FACTOR : c.REVENUE_LIMIT_FACTOR);
  const eligible = input.annualRevenue <= limit;
  return finishResult(input, { id: 'flat', name: 'Átalányadó', status: eligible ? 'eligible' : 'excluded', eligible,
    reason: eligible ? '' : 'Az átalányadó bevételi jogosultsági határa túllépve.', notes: [], income, exemptIncome, taxableIncome, revenueLimit: limit,
    szja: taxableIncome * c.SZJA_RATE, tb: retired ? 0 : Math.max(base, taxableIncome) * c.TBJ_RATE,
    szocho: retired ? 0 : Math.max(base * c.SZOCHO_MULTIPLIER, taxableIncome) * c.SZOCHO_RATE,
    flatTax: 0, penalty: 0, supplement: 0, ...calculateHipa(input, 'flat') });
}
function calculateVszja(input) {
  const c = TAX_CONFIG.VSZJA, rates = TAX_CONFIG.ATALANYADO;
  const withdrawal = input.monthlyWithdrawal * months;
  // Tbj. supplementary activity: no own TB or business szocho. The separate
  // dividend szocho remains payable under Szocho tv. 1(5), subject to its cap.
  const contributionBase = input.employment === 'retired' ? 0 : Math.max(withdrawal, input.employment === 'full' ? minimumBase(input) * months : 0);
  const businessSzocho = contributionBase * c.MIN_SZOCHO_MULTIPLIER * rates.SZOCHO_RATE;
  const hipa = calculateHipa(input, 'vszja');
  const taxCosts = input.taxCostMode === 'actual' ? input.paidTaxCosts : businessSzocho + hipa.hipa;
  const deductibleCosts = input.costsLinked ? input.monthlyExpenses * months : input.deductibleCosts;
  const rawProfit = input.annualRevenue - deductibleCosts - withdrawal - taxCosts;
  const profit = nonnegative(rawProfit + input.profitAdjustment);
  const comparisonBase = rawProfit + input.comparisonAdjustment;
  const minimumIncome = input.annualRevenue * c.INCOME_MINIMUM_RATE, needsMinimum = comparisonBase < minimumIncome;
  const lossUsed = needsMinimum && input.minimumTreatment === 'minimum' ? 0 : Math.min(input.loss, profit * c.LOSS_LIMIT_RATIO);
  const businessTaxBase = needsMinimum && input.minimumTreatment === 'minimum' ? minimumIncome : nonnegative(profit - lossUsed);
  const businessSzja = businessTaxBase * c.BUSINESS_SZJA_RATE;
  // Szja 49/B(9): after-tax entrepreneurial income starts with the tax base,
  // including a chosen income minimum; it is not necessarily cash profit.
  const dividendBase = nonnegative(businessTaxBase - businessSzja + input.dividendAdjustment);
  const szochoIncomeCap = yearParameters(input).minWage * c.SZOCHO_CAP_MIN_WAGE_FACTOR;
  const remainingCap = nonnegative(szochoIncomeCap - input.otherIncome - withdrawal);
  const dividendSzocho = Math.min(dividendBase, remainingCap) * c.DIVIDEND_SZOCHO_RATE;
  const dividendSzja = dividendBase * c.DIVIDEND_SZJA_RATE, withdrawalSzja = withdrawal * rates.SZJA_RATE;
  const notes = [];
  if (needsMinimum) notes.push(input.minimumTreatment === 'minimum'
    ? 'VSZJA: a hasonlítási alap a jövedelemminimum alatt van, ezért a bevétel 2%-a után számoljuk a vállalkozói SZJA-t.'
    : input.minimumTreatment === 'declaration' ? 'VSZJA: a jövedelemminimum helyett a bevallást kiegészítő nyilatkozatot feltételezzük.' : 'VSZJA: a megadott törvényi kivétel alapján mellőzzük a jövedelemminimumot.');
  if (input.loss > lossUsed) notes.push(`A megadott veszteségből ebben a számításban ${money(lossUsed)} érvényesíthető az általános korlát miatt.`);
  return finishResult(input, { id: 'vszja', name: 'VSZJA', status: 'eligible', eligible: true, reason: '', notes,
    withdrawal, withdrawalSzja, rawProfit, profit, businessTaxBase, comparisonBase, minimumIncome, needsMinimum,
    deductibleCosts, taxCosts, lossUsed, businessSzja, dividendBase, dividendSzja, businessSzocho, dividendSzocho,
    szochoIncomeCap, remainingCap, szja: withdrawalSzja + businessSzja + dividendSzja,
    tb: contributionBase * rates.TBJ_RATE, szocho: businessSzocho + dividendSzocho,
    flatTax: 0, penalty: 0, supplement: 0, ...hipa });
}
function calculateAll(input) { return [calculateKata(input), calculateFlat(input), calculateVszja(input)]; }
function rankResults(results) { return results.filter(result => result.eligible).sort((a, b) => b.cashNet - a.cashNet); }
function modelBreakpoints(input, maxRevenue) {
  const c = kataParameters(input), q = payerRatio(input), factor = 1 - costRatio(input);
  const exempt = yearParameters(input).minWage * TAX_CONFIG.ATALANYADO.EXEMPT_FACTOR;
  const points = [0, maxRevenue, exempt / factor, c.limit, ...TAX_CONFIG.HIPA.TIERS.map(tier => tier.LIMIT),
    TAX_CONFIG.HIPA.REVENUE_LIMIT, TAX_CONFIG.HIPA.RETAIL_FLAT_REVENUE_LIMIT,
    input.monthlyMaterials * months, calculateFlat(input).revenueLimit];
  if (input.employment === 'full') points.push((exempt + minimumBase(input) * months) / factor);
  if (c.isNew && q > 0) {
    const thresholdBase = c.monthlyTax * months / TAX_CONFIG.KATA_DRAFT.SUPPLEMENT_RATE;
    points.push(thresholdBase / q);
    if (input.excessShare !== null && q < 1) {
      const a = input.excessShare / 100;
      if (Math.abs(q - a) > 1e-12) points.push((thresholdBase - a * c.limit) / (q - a), -a * c.limit / (q - a), (1 - a) * c.limit / (q - a));
    } else if (input.excessShare === null && q < 1) {
      // Unknown allocation can still be exact while both possible supplements are zero.
      points.push(thresholdBase / q, (c.limit - thresholdBase) / (1 - q));
    }
  }
  return [...new Set(points.filter(point => Number.isFinite(point) && point >= 0 && point <= maxRevenue))].sort((a, b) => a - b);
}
/** Algebraic roots on affine pieces, with validity gaps and jumps kept explicit. */
function findBreakEven(input, maxRevenue = UI_CONFIG.MONTHLY_REVENUE_MAX * months) {
  const points = modelBreakpoints(input, maxRevenue), tolerance = 1e-6;
  const difference = revenue => {
    const scenario = { ...input, annualRevenue: revenue }, kata = calculateKata(scenario), flat = calculateFlat(scenario);
    return kata.eligible && flat.eligible ? flat.totalTax - kata.totalTax : null;
  };
  const pieces = [], events = [];
  for (let i = 0; i < points.length - 1; i++) {
    const low = points[i], high = points[i + 1], x1 = low + (high - low) / 3, x2 = low + (high - low) * 2 / 3;
    const d1 = difference(x1), d2 = difference(x2);
    if (d1 === null || d2 === null) { pieces.push({ low, high, valid: false }); continue; }
    const slope = (d2 - d1) / (x2 - x1), intercept = d1 - slope * x1;
    pieces.push({ low, high, valid: true, slope, intercept });
    if (Math.abs(slope) > 1e-12) { const root = -intercept / slope; if (root > low + tolerance && root < high - tolerance) events.push({ annualRevenue: root, type: 'equality' }); }
  }
  for (let i = 1; i < points.length - 1; i++) {
    const lp = pieces[i - 1], rp = pieces[i];
    if (!lp.valid || !rp.valid) continue;
    const point = points[i], left = lp.slope * point + lp.intercept, right = rp.slope * point + rp.intercept;
    if (Math.abs(left - right) > tolerance) { if (left * right < 0) events.push({ annualRevenue: point, type: 'jump' }); }
    else if (Math.abs(left) <= tolerance && (Math.abs(lp.slope) > 1e-12 || Math.abs(rp.slope) > 1e-12)) events.push({ annualRevenue: point, type: 'equality' });
  }
  events.sort((a, b) => a.annualRevenue - b.annualRevenue);
  const unique = events.filter((event, i) => !i || Math.abs(event.annualRevenue - events[i - 1].annualRevenue) > tolerance);
  const boundaries = [...new Set([...points, ...unique.map(event => event.annualRevenue)])].sort((a, b) => a - b), intervals = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const low = boundaries[i], high = boundaries[i + 1], d = difference((low + high) / 2);
    const winner = d === null ? 'unavailable' : Math.abs(d) <= tolerance ? 'tie' : d > 0 ? 'kata' : 'flat';
    const previous = intervals[intervals.length - 1];
    if (previous && previous.winner === winner && !unique.some(event => Math.abs(event.annualRevenue - low) < tolerance)) previous.high = high;
    else intervals.push({ low, high, winner });
  }
  return { events: unique, intervals, maxRevenue, partial: intervals.some(interval => interval.winner === 'unavailable') };
}
const TABLE_ROWS = [
  { label: 'Bevétel / év', key: 'annualRevenue', always: true },
  { label: 'Bevétel / hó', value: r => r.annualRevenue / months, always: true },
  { label: 'SZJA összesen', key: 'szja' }, { label: 'Ebből kivét SZJA (15%)', key: 'withdrawalSzja' },
  { label: 'Ebből vállalkozói SZJA (9%)', key: 'businessSzja' }, { label: 'Ebből osztalék SZJA (15%)', key: 'dividendSzja' },
  { label: 'TB-járulék (18,5%)', key: 'tb' }, { label: 'Szocho összesen (13%)', key: 'szocho' },
  { label: 'Ebből osztalék szocho', key: 'dividendSzocho' }, { label: 'KATA tételes adó', key: 'flatTax' },
  { label: 'KATA kiegészítő adó (15%, beszámítással)', key: 'supplement' }, { label: 'KATA különadó (40%)', key: 'penalty' },
  { label: 'Iparűzési adó (HIPA)', key: 'hipa' }, { label: 'Összes adó és járulék / év', key: 'totalTax', className: 'total' },
  { label: 'Összes adó és járulék / hó', value: r => r.totalTax / months },
  { label: 'VSZJA bruttó kivét / év (belső jövedelem)', key: 'withdrawal' },
  { label: 'VSZJA elszámolható működési költség', key: 'deductibleCosts' }, { label: 'VSZJA levonható üzleti adóköltség', key: 'taxCosts' },
  { label: 'VSZJA érvényesített veszteség', key: 'lossUsed' }, { label: 'VSZJA vállalkozói adóalap', key: 'businessTaxBase' },
  { label: 'VSZJA osztalékalap', key: 'dividendBase' }, { label: 'VSZJA fennmaradó szocho-jövedelemkeret', key: 'remainingCap' },
  { label: 'Adók után, kiadások előtt / év', key: 'afterTaxBeforeCosts' }, { label: 'Tényleges működési kiadás / év', key: 'annualCosts', always: true },
  { label: 'Zsebben marad / év', key: 'cashNet', className: 'net' }, { label: 'Zsebben marad / hó', value: r => r.cashNet / months, className: 'net net-monthly' },
  { label: 'Effektív adóterhelés', key: 'effectiveRate', percent: true }
];
function rowValue(row, result) { return row.value ? row.value(result) : result[row.key] ?? 0; }
function parseMoney(value, signed = false) {
  const cleaned = value.trim().replace(/[\s\u00a0\u202f.]/g, '');
  if (!(signed ? /^-?\d+(?:,\d{1,2})?$/ : /^\d+(?:,\d{1,2})?$/).test(cleaned)) return NaN;
  const number = Number(cleaned.replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

function initApp() {
  const el = id => document.getElementById(id), form = el('tax-form');
  let state = { ...DEFAULT_STATE }, results = [], announcementTimer;
  const invalidFields = new Set();
  const moneyFields = {
    expenses: 'monthlyExpenses', materials: 'monthlyMaterials', withdrawal: 'monthlyWithdrawal',
    'other-income': 'otherIncome', 'deductible-costs': 'deductibleCosts', 'paid-tax-costs': 'paidTaxCosts',
    'profit-adjustment': 'profitAdjustment', loss: 'loss', 'comparison-adjustment': 'comparisonAdjustment',
    'dividend-adjustment': 'dividendAdjustment', 'future-min': 'futureMin', 'future-guaranteed': 'futureGuaranteed'
  };
  const signedFields = new Set(['profit-adjustment', 'comparison-adjustment', 'dividend-adjustment']);
  const numericFields = { 'b2b-share': 'b2bShare', 'largest-payer': 'largestPayer', 'excess-share': 'excessShare', 'hipa-rate': 'hipaRate', towns: 'towns' };
  const selectFields = { 'kata-version': 'kataVersion', 'kata-eligibility': 'kataEligibility', 'cost-ratio': 'costCategory', 'hipa-method': 'hipaMethod', 'tax-cost-mode': 'taxCostMode', 'minimum-treatment': 'minimumTreatment' };
  const checkFields = { 'employer-client': 'employerClient', taxi: 'taxi', 'costs-linked': 'costsLinked' };
  function setError(id, message) {
    el(`${id}-error`).textContent = message; el(id).setAttribute('aria-invalid', String(Boolean(message)));
    if (message) invalidFields.add(id); else invalidFields.delete(id);
  }
  function rangeFill(range) {
    const fill = 100 * (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min));
    range.style.setProperty('--fill', `${fill}%`);
    range.setAttribute('aria-valuetext', `${money(Number(range.value))} ${range.id === 'revenue-range' && state.period === 'annual' ? 'évente' : 'havonta'}`);
  }
  function syncRevenue() {
    const multiplier = state.period === 'annual' ? months : 1, value = state.annualRevenue / (state.period === 'annual' ? 1 : months);
    el('revenue').value = preciseFormat.format(value);
    el('revenue-unit').textContent = state.period === 'annual' ? 'Ft / év' : 'Ft / hó';
    Object.assign(el('revenue-range'), { min: UI_CONFIG.MONTHLY_REVENUE_MIN * multiplier, max: UI_CONFIG.MONTHLY_REVENUE_MAX * multiplier, step: 'any', value });
    el('range-min').textContent = money(Number(el('revenue-range').min)); el('range-max').textContent = money(Number(el('revenue-range').max)); rangeFill(el('revenue-range'));
  }
  function syncControls() {
    syncRevenue();
    Object.entries(moneyFields).forEach(([id, key]) => { el(id).value = amountFormat.format(state[key]); });
    Object.entries(numericFields).forEach(([id, key]) => { el(id).value = state[key] ?? ''; });
    Object.entries(selectFields).forEach(([id, key]) => { el(id).value = state[key]; });
    Object.entries(checkFields).forEach(([id, key]) => { el(id).checked = state[key]; });
    ['mode', 'period', 'employment', 'clients', 'skill'].forEach(name => form.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = input.value === state[name]; }));
    el('expenses-range').max = UI_CONFIG.MONTHLY_EXPENSE_MAX; el('expenses-range').value = state.monthlyExpenses; rangeFill(el('expenses-range'));
  }
  function renderSettings() {
    const draft = state.mode === 'draft', c = kataParameters(state), year = yearParameters(state);
    el('draft-settings').hidden = !draft; el('payer-settings').hidden = state.clients === 'private';
    el('draft-payer-settings').hidden = !c.isNew; el('taxi-setting').hidden = c.isNew;
    el('paid-tax-setting').hidden = state.taxCostMode !== 'actual'; el('deductible-costs').disabled = state.costsLinked;
    if (state.costsLinked) el('deductible-costs').value = amountFormat.format(state.monthlyExpenses * months);
    el('skill-fieldset').disabled = state.employment !== 'full';
    el('guaranteed-label').textContent = `Szakképzettséget igénylő főtevékenység · ${money(year.guaranteed)}/hó`;
    el('minimum-label').textContent = `${money(year.minWage)}/hó`;
    el('retired-note').hidden = state.employment !== 'retired';
    el('floor-note').textContent = state.employment === 'full' ? 'Főállásban a TB és a szocho minimumalapja a választott béralap 100%-a.' : state.employment === 'retired' ? 'Nyugdíjasként nincs minimumalap: az átalányjövedelem és a kivét saját TB-je, üzleti szochója 0 Ft a kedvezmények nélküli modellben.' : 'Mellékállásban nincs minimumalap; a tényleges adóköteles jövedelem / kivét után számolunk.';
    el('cost-ratio').options[0].textContent = `${amountFormat.format(year.generalRatio * 100)}% – Általános tevékenységek, IT, tanácsadás`;
    el('b2b-note').textContent = c.isNew ? 'A tervezet engedné a kifizetői számlázást, kiegészítő adóval és korlátozásokkal.' : 'A régi KATA kifizetői bevétel mellett főszabály szerint nem alkalmazható.';
    el('mode-notice').textContent = draft ? '2027-es egyeztetési tervezet · Bérfeltételezésekkel' : '2026-os szabályok · Ellenőrizve: 2026. október 10.';
    el('mode-description').textContent = draft ? 'A tervezet még nem hatályos. A 2027-es bérértékeket szerkeszthető becslésként használjuk; alapértékük a 2026-os bérminimum.' : 'Teljes éves, egyenletes működésre, adókedvezmények nélkül számolunk. A jogosultsági feltételeket az adatbekérőben adhatod meg.';
    el('annual-equivalent').textContent = money(state.annualRevenue);
    ['kata-legend', 'kata-table-title', 'kata-pros-title'].forEach(id => { el(id).textContent = c.name; });
    el('kata-marker').textContent = draft ? '01 / TERVEZET' : '01 / 2026';
    const pros = [`${money(c.monthlyTax)}/hó tételes adó a választott jogviszonyban`, 'Egyszerűbb nyilvántartás és bevallás', c.isNew ? 'Kifizetői bevétel a tervezeti feltételekkel' : 'Magánszemély ügyfelekre kialakított adózási forma'];
    const cons = ['Adófizetéssel érintett hónapban bevétel nélkül is fizetendő', `${money(c.limit)} éves keret felett 40% különadó`, c.isNew ? 'Kifizetői kiegészítő adó és ügyfélkorlátozások' : 'Főállás és kifizetői bevételi korlátozás'];
    el('kata-pros').innerHTML = pros.map(text => `<li>${text}</li>`).join(''); el('kata-cons').innerHTML = cons.map(text => `<li>${text}</li>`).join('');
    el('method-parameters').textContent = `${year.year}${draft ? ' – tervezeti szimuláció, feltételezett bérekkel' : ' – hatályos szabályok'}: minimálbér ${money(year.minWage)}, garantált bérminimum ${money(year.guaranteed)}, általános költséghányad ${rateFormat.format(year.generalRatio)}. Adómentes átalányjövedelem ${money(year.minWage * TAX_CONFIG.ATALANYADO.EXEMPT_FACTOR)}/év; szocho-jövedelemkeret ${money(year.minWage * TAX_CONFIG.VSZJA.SZOCHO_CAP_MIN_WAGE_FACTOR)}/év. HIPA: ${rateFormat.format(state.hipaRate / 100)}, ${state.towns} azonos kulcsú település.`;
    el('export').disabled = invalidFields.size > 0;
    document.querySelector('.status-badge').lastChild.textContent = invalidFields.size ? ' Utolsó érvényes számítás' : ' Élő számítás';
  }
  function renderVerdict() {
    const ranked = rankResults(results), winner = ranked[0], runner = ranked[1];
    const incomplete = results.some(result => ['unknown', 'uncertain'].includes(result.status));
    const advantage = runner ? winner.cashNet - runner.cashNet : null, tied = advantage !== null && advantage < .005;
    el('verdict-title').textContent = winner ? tied ? `${winner.name} és ${runner.name}` : winner.name : 'Nincs összehasonlítható eredmény';
    el('verdict-summary').textContent = winner ? `${incomplete ? 'A biztosan számítható, jogosult formák közül' : 'A megadott feltételekkel'} ${tied ? 'a két forma azonos megmaradó összeget ad' : `a legtöbb pénz ${winner.name} esetén marad nálad`}.${runner && !tied ? ` Évente ${money(advantage)}-tal, havonta átlagosan ${money(advantage / months)}-tal több, mint ${runner.name} esetén.` : ''}${incomplete ? ' A KATA hiányzó adatai miatt ez nem teljes körű rangsor.' : ''}` : 'A megadott adatokkal nem áll rendelkezésre jogosult eredmény.';
    el('annual-advantage').textContent = advantage === null ? '—' : `${tied ? '' : '+'}${money(advantage)}`;
    el('monthly-advantage').textContent = advantage === null ? '—' : `${tied ? '' : '+'}${money(advantage / months)}`;
    el('verdict-title').closest('.verdict').querySelector('.verdict-footnote').textContent = runner ? 'A második legjobb, biztosan számítható formához képest, azonos tényleges kiadások mellett.' : 'Az előnyhöz legalább két jogosult, biztosan számítható eredmény szükséges.';
    const notes = [];
    if (invalidFields.size) notes.push('Javításra váró mező: az utolsó érvényes beviteli adatokat használjuk. A CSV-export a javításig nem elérhető.');
    if (state.employment === 'retired') notes.push('Nyugdíjas jogállás: az átalányjövedelem és a kivét után saját TB-t, üzleti szochót nem számolunk. A VSZJA osztalékalapjának szochója a fennmaradó éves keretig fizetendő; maga a nyugdíj nem fogyasztja ezt a keretet. Az anyák kedvezményére vonatkozó külön szabályokat a modell nem kezeli.');
    results.forEach(result => { if (result.reason) notes.push(`${result.name}: ${result.reason}`); notes.push(...result.notes); if (result.hipaFallback) notes.push(`${result.name}: az egyszerűsített HIPA bevételi határa túllépve, normál adóalappal számolunk.`); });
    if (state.taxCostMode === 'estimate') notes.push('A VSZJA adóköltsége becslés: az éves üzleti szocho és HIPA adóévi megfizetését feltételezzük. Tényleges befizetés a részletes beállításokban adható meg.');
    if (winner && winner.cashNet < 0) notes.push('A legkedvezőbb számítható esetben is negatív a megmaradó összeg: a kiadások és közterhek meghaladják a bevételt.');
    el('scenario-notes').replaceChildren(...[...new Set(notes)].map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
    el('summary-cards').innerHTML = results.map(result => {
      const isWinner = result.eligible && winner && Math.abs(result.cashNet - winner.cashNet) < .005;
      const badge = result.eligible ? isWinner ? 'Legkedvezőbb' : '' : result.status === 'excluded' ? 'Nem alkalmazható' : 'Adat szükséges';
      const net = result.eligible ? `${amountFormat.format(result.cashNet / months)} <small>Ft</small>` : result.netRange ? `<small>${money(result.netRange[0] / months)} – ${money(result.netRange[1] / months)}</small>` : '—';
      const percent = result.eligible && result.effectiveRate !== null ? rateFormat.format(result.effectiveRate) : '—';
      const action = result.status === 'unknown' ? '<button type="button" class="text-button" data-open-field="kata-eligibility">Feltételek megadása ↗</button>' : result.status === 'uncertain' ? '<button type="button" class="text-button" data-open-field="excess-share">Megosztás megadása ↗</button>' : '';
      return `<article class="summary-card ${isWinner ? 'winner' : ''} ${result.eligible ? '' : 'unavailable'}"><div class="summary-top"><h3>${result.name}</h3>${badge ? `<span class="badge ${result.eligible ? '' : 'neutral'}">${badge}</span>` : ''}</div><p class="summary-label">Havonta a zsebedben${result.netRange ? ' · tartomány' : ''}</p><strong class="summary-net">${net}</strong>${result.reason ? `<p class="summary-reason">${result.reason}</p>` : ''}${action}<div class="summary-tax"><span>Effektív adóteher</span><strong>${percent}</strong></div><div class="tax-track" aria-hidden="true"><span style="width:${result.eligible ? Math.min(100, Math.max(0, (result.effectiveRate || 0) * 100)) : 0}%"></span></div></article>`;
    }).join('');
    el('comparison-body').innerHTML = `<tr><th scope="row">Alkalmazhatóság</th>${results.map(result => `<td>${result.eligible ? 'Számítható' : result.status === 'excluded' ? 'Nem alkalmazható' : 'Adat szükséges'}</td>`).join('')}</tr>` + TABLE_ROWS.map(row => `<tr class="${row.className || ''}"><th scope="row">${row.label}</th>${results.map(result => {
      const value = rowValue(row, result), available = row.always || result.eligible;
      return `<td${winner && result.eligible && result.id === winner.id ? ' class="winning-cell"' : ''}>${!available ? '—' : row.percent ? result.effectiveRate === null ? '—' : rateFormat.format(value) : money(value)}</td>`;
    }).join('')}</tr>`).join('');
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => { el('result-announcement').textContent = invalidFields.size ? 'Javításra váró mező. Utolsó érvényes számítás.' : winner ? `${incomplete ? 'A biztos eredmények közül' : 'Legkedvezőbb'}: ${winner.name}. Havonta ${money(winner.cashNet / months)} marad.` : 'Nincs összehasonlítható eredmény.'; }, UI_CONFIG.ANNOUNCEMENT_DELAY);
  }
  function renderBreakEven() {
    const comparison = findBreakEven(state), valid = comparison.intervals.filter(interval => interval.winner !== 'unavailable');
    const names = { kata: kataParameters(state).name, flat: 'Átalányadó', tie: 'Azonos adóteher', unavailable: 'Nem hasonlítható össze' };
    el('crossover-ratio').textContent = `${amountFormat.format(costRatio(state) * 100)}% költséghányad`;
    el('break-even-summary').textContent = !valid.length ? 'A KATA jogosultsága vagy a szükséges adatok hiánya miatt nincs megbízható KATA–átalányadó fordulópont.'
      : comparison.events.length ? `${comparison.events.length} fordulópont a számítható bevételi szakaszokon.${comparison.partial ? ' A vizsgálat egyes szakaszokon hiányos; azokra nem adunk ajánlást.' : ''}`
      : `Nincs fordulópont a számítható szakaszokon.${comparison.partial ? ' A nem meghatározható szakaszokat külön jelöljük.' : ''}`;
    el('break-even-details').innerHTML = comparison.events.map(event => `<p><strong>${preciseMoney(event.annualRevenue / months)}/hó</strong> (${preciseMoney(event.annualRevenue)}/év): ${event.type === 'jump' ? 'sávváltás miatti fordulat, nem adóegyezés.' : 'azonos éves közteher.'}</p>`).join('') + (valid.length ? comparison.intervals.map(interval => `<p>${preciseMoney(interval.low / months)} – ${preciseMoney(interval.high / months)}/hó: <strong>${names[interval.winner]}</strong> ${interval.winner === 'kata' || interval.winner === 'flat' ? 'kedvezőbb a sáv belsejében.' : ''}</p>`).join('') : '');
  }
  function renderChart() {
    const min = UI_CONFIG.MONTHLY_REVENUE_MIN * months, max = UI_CONFIG.MONTHLY_REVENUE_MAX * months, points = new Set([min, max, state.annualRevenue]);
    for (let i = 0; i <= UI_CONFIG.CHART_SAMPLES; i++) points.add(min + (max - min) * i / UI_CONFIG.CHART_SAMPLES);
    modelBreakpoints(state, max).forEach(point => { if (point > min && point < max) { points.add(point - .01); points.add(point); points.add(point + .01); } });
    const data = [...points].sort((a, b) => a - b).map(revenue => ({ revenue, values: calculateAll({ ...state, annualRevenue: revenue }).map(result => result.eligible ? result.cashNet / months : null) }));
    const allValues = data.flatMap(point => point.values).filter(value => value !== null);
    const rawMin = Math.min(0, ...allValues), rawMax = Math.max(1, ...allValues);
    const step = Math.max(250000, Math.ceil((rawMax - rawMin) / 4 / 250000) * 250000), yMin = Math.floor(rawMin / step) * step, yMax = Math.ceil(rawMax / step) * step;
    const width = 640, height = 230, left = 64, right = 14, top = 22, bottom = 32;
    const x = revenue => left + (revenue - min) / (max - min) * (width - left - right), y = value => top + (yMax - value) / (yMax - yMin) * (height - top - bottom);
    let grid = '';
    for (let value = yMin; value <= yMax + 1; value += step) grid += `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-label" x="${left - 9}" y="${y(value) + 3}" text-anchor="end">${preciseFormat.format(value / 1000000)} M Ft</text>`;
    [100000, 500000, 1000000, 1500000, 2000000, 2500000].forEach(value => { grid += `<text class="chart-label" x="${x(value * months)}" y="${height - 10}" text-anchor="middle">${preciseFormat.format(value / 1000000)} M</text>`; });
    const paths = REGIMES.map((regime, index) => {
      let connected = false;
      const path = data.map(point => { if (point.values[index] === null) { connected = false; return ''; } const command = connected ? 'L' : 'M'; connected = true; return `${command}${x(point.revenue).toFixed(3)},${y(point.values[index]).toFixed(3)}`; }).join(' ');
      return path.trim() ? `<path class="chart-line chart-${regime.color}" d="${path}"/>` : '';
    }).join('');
    const currentX = x(state.annualRevenue);
    el('comparison-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">Havi megmaradó összeg a bevétel függvényében</title><desc id="chart-description">Jogosult, számítható formák összehasonlítása 100 ezer és 2,5 millió Ft havi bevétel között. A hiányzó szakaszok nem számíthatók vagy nem alkalmazhatók. A szaggatott vonal az aktuális bevételt jelzi; a pontos összegek a táblázatban találhatók.</desc>${grid}${paths}<line class="chart-current" x1="${currentX}" x2="${currentX}" y1="${top}" y2="${height - bottom}"/><text class="chart-label" x="${Math.min(width - right - 50, Math.max(left + 50, currentX))}" y="12" text-anchor="middle">A bevételed</text></svg>`;
  }
  function render() { results = calculateAll(state); renderSettings(); renderVerdict(); renderBreakEven(); renderChart(); }
  function handleMoney(id) {
    const signed = signedFields.has(id), value = parseMoney(el(id).value, signed), isWage = id.startsWith('future-');
    const max = id === 'revenue' ? UI_CONFIG.MONTHLY_REVENUE_MAX * (state.period === 'annual' ? months : 1) : ['expenses', 'materials', 'withdrawal'].includes(id) ? UI_CONFIG.MONTHLY_EXPENSE_MAX : 1000000000;
    const min = id === 'revenue' ? UI_CONFIG.MONTHLY_REVENUE_MIN * (state.period === 'annual' ? months : 1) : signed ? -max : isWage ? 1 : 0;
    let error = !Number.isFinite(value) || value < min || value > max || (id !== 'revenue' && !Number.isInteger(value)) ? `Adj meg ${money(min)} és ${money(max)} közötti ${id === 'revenue' ? 'összeget' : 'egész összeget'}.` : '';
    if (!error && ((id === 'future-min' && value > state.futureGuaranteed) || (id === 'future-guaranteed' && value < state.futureMin))) error = 'A garantált bérminimum nem lehet kisebb a minimálbérnél.';
    setError(id, error);
    if (!error) {
      if (id === 'revenue') { state.annualRevenue = Math.round(value * (state.period === 'annual' ? 1 : months)); el('revenue-range').value = value; rangeFill(el('revenue-range')); }
      else state[moneyFields[id]] = value;
      if (id === 'expenses') { el('expenses-range').value = value; rangeFill(el('expenses-range')); if (state.costsLinked) state.deductibleCosts = value * months; }
    }
    render();
  }
  ['revenue', ...Object.keys(moneyFields)].forEach(id => {
    el(id).addEventListener('input', () => handleMoney(id));
    el(id).addEventListener('blur', () => { if (!invalidFields.has(id)) el(id).value = preciseFormat.format(parseMoney(el(id).value, signedFields.has(id))); });
  });
  Object.entries(numericFields).forEach(([id, key]) => el(id).addEventListener('input', () => {
    const blankOptional = id === 'excess-share' && el(id).value === '', value = Number(el(id).value), min = Number(el(id).min), max = Number(el(id).max);
    const error = !blankOptional && (el(id).value === '' || !Number.isFinite(value) || value < min || value > max || (id === 'towns' && !Number.isInteger(value))) ? `Adj meg ${min} és ${max} közötti ${id === 'towns' ? 'egész ' : ''}értéket.` : '';
    const concentrationError = !error && id === 'largest-payer' && value > state.b2bShare ? 'Az arány nem lehet nagyobb az összes kifizetői bevétel arányánál.' : '';
    setError(id, error || concentrationError);
    if (!error && !concentrationError) {
      state[key] = blankOptional ? null : value;
      if (id === 'b2b-share' && state.largestPayer > value) { state.largestPayer = value; el('largest-payer').value = value; setError('largest-payer', ''); }
    }
    render();
  }));
  el('revenue-range').addEventListener('input', event => { state.annualRevenue = Math.round(Number(event.target.value) * (state.period === 'annual' ? 1 : months)); setError('revenue', ''); syncRevenue(); render(); });
  el('expenses-range').addEventListener('input', event => { el('expenses').value = event.target.value; handleMoney('expenses'); });
  form.addEventListener('change', event => {
    const target = event.target;
    if (target.type === 'radio') {
      state[target.name] = target.value;
      if (target.name === 'period') { setError('revenue', ''); syncRevenue(); }
      if (target.name === 'clients' && target.value === 'private') ['b2b-share', 'largest-payer', 'excess-share'].forEach(id => { if (invalidFields.has(id)) { setError(id, ''); el(id).value = state[numericFields[id]] ?? ''; } });
      if (target.name === 'mode' && target.value === 'current') ['future-min', 'future-guaranteed', 'largest-payer', 'excess-share'].forEach(id => { if (invalidFields.has(id)) { setError(id, ''); el(id).value = state[moneyFields[id] || numericFields[id]] ?? ''; } });
    } else if (selectFields[target.id]) {
      state[selectFields[target.id]] = target.value;
      if (target.id === 'tax-cost-mode' && target.value === 'estimate') { setError('paid-tax-costs', ''); el('paid-tax-costs').value = amountFormat.format(state.paidTaxCosts); }
    } else if (checkFields[target.id]) {
      state[checkFields[target.id]] = target.checked;
      if (target.id === 'costs-linked') { state.deductibleCosts = state.monthlyExpenses * months; setError('deductible-costs', ''); el('deductible-costs').value = amountFormat.format(state.deductibleCosts); }
    } else return;
    render();
  });
  form.addEventListener('submit', event => event.preventDefault());
  el('summary-cards').addEventListener('click', event => {
    const button = event.target.closest('[data-open-field]');
    if (!button) return;
    const field = el(button.dataset.openField);
    for (let parent = field.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    field.scrollIntoView({ behavior: 'instant', block: 'center' });
    field.focus({ preventScroll: true });
  });
  el('reset').addEventListener('click', () => { state = { ...DEFAULT_STATE }; [...invalidFields].forEach(id => setError(id, '')); syncControls(); render(); });
  el('export').addEventListener('click', () => {
    if (invalidFields.size) return;
    const cell = value => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [
      ['EV Mérleg – éves összehasonlítás, nem hivatalos adótanácsadás'],
      ['Mód', state.mode === 'current' ? '2026 – hatályos' : '2027 – egyeztetési tervezet, feltételezett bérekkel'],
      ['Jogállás', { full: 'Főállású egyéni vállalkozó', side: 'Mellékállású vállalkozó', retired: 'Nyugdíjas, kiegészítő tevékenységet folytató vállalkozó' }[state.employment]],
      ['Ellenőrzés napja', TAX_CONFIG.CHECKED_ON], ['Bemeneti adatok', JSON.stringify(state)],
      ['Évparaméterek', JSON.stringify(yearParameters(state))], ['Költséghányad', costRatio(state)],
      ['Adóköltség', state.taxCostMode === 'estimate' ? 'Éves üzleti szocho és HIPA megfizetésének becslése' : 'Megadott tényleges adóköltség'],
      [], ['Tétel', ...results.map(r => r.name)], ['Alkalmazhatóság', ...results.map(r => r.eligible ? 'Számítható' : r.reason)],
      ...TABLE_ROWS.map(row => [row.label, ...results.map(result => row.always || result.eligible ? row.percent ? result.effectiveRate === null ? '—' : rateFormat.format(rowValue(row, result)) : Math.round(rowValue(row, result)) : '—')]),
      ['KATA adótartomány / év', ...results.map(r => r.taxRange ? r.taxRange.map(value => Math.round(value)).join(' – ') : '—')],
      ['Megjegyzések', ...results.map(r => r.notes.join(' '))],
      ['Alkalmazási kör', 'Teljes év, egyenletes bevétel és kivét; kedvezmények nélkül, az anyák kedvezményének külön szabályai nélkül. Nyugdíjasnál saját TB és üzleti szocho nincs; osztalékszocho felmerülhet. A 2027-es mód tervezet és bérbecslés.']
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF', lines.map(line => line.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ev-merleg-${yearParameters(state).year}-osszehasonlitas.csv`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const themeToggle = el('theme-toggle');
  function applyTheme(theme) { document.documentElement.dataset.theme = theme; themeToggle.setAttribute('aria-pressed', String(theme === 'dark')); themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Világos megjelenés bekapcsolása' : 'Sötét megjelenés bekapcsolása'); }
  let initialTheme; try { initialTheme = localStorage.getItem('ev-merleg-theme'); } catch { /* Optional storage. */ }
  applyTheme(['light', 'dark'].includes(initialTheme) ? initialTheme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  themeToggle.addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(theme); try { localStorage.setItem('ev-merleg-theme', theme); } catch { /* Optional storage. */ } });
  function configuredLink(id, url) { if (!url) return false; try { const parsed = new URL(url); if (parsed.protocol !== 'https:') return false; el(id).href = parsed.href; return true; } catch { return false; } }
  if (configuredLink('revolut-business-link', PARTNER_CONFIG.REVOLUT_BUSINESS_URL)) { el('revolut-business-link').hidden = false; el('revolut-unavailable').hidden = true; }
  if (configuredLink('coffee-link', PARTNER_CONFIG.COFFEE_URL)) { el('coffee-link').hidden = false; el('coffee-unavailable').hidden = true; }
  syncControls(); render();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp, { once: true });
  else initApp();
}
