// Run with: node tests/tax.test.js (development checks; no runtime dependency).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
const api = vm.runInContext('({DEFAULT_STATE,calculateKata,calculateFlat,calculateVszja,calculateHipa,calculateAll,rankResults,findBreakEven,costRatio,yearParameters,parseMoney})', context);
const state = overrides => ({ ...api.DEFAULT_STATE, kataEligibility: 'yes', ...overrides });
let checks = 0;
function near(actual, expected, label, tolerance = 1e-6) {
  checks++;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
function equal(actual, expected, label) { checks++; assert.equal(actual, expected, label); }

// Audit figures, independently specified expected values.
const flat = api.calculateFlat(state());
near(flat.exemptIncome, 1936800, '2026 exemption');
near(flat.szja, 501480, '2026 general SZJA');
near(flat.tb, 828504, '2026 guaranteed TB floor');
near(flat.szocho, 582192, '2026 100% szocho floor');
near(flat.totalTax, 1962176, 'Audit flat annual total');
near(flat.cashNet, 7037824, 'Actual costs deducted');
// Pensioner examples: no contribution floor or own contributions, but SZJA
// and HIPA remain. Pensioner dividend income has its own szocho obligation.
const retired = state({ employment: 'retired' });
const retiredFlat = api.calculateFlat(retired);
near(retiredFlat.tb, 0, 'Retired flat TB exemption');
near(retiredFlat.szocho, 0, 'Retired flat business szocho exemption');
near(retiredFlat.szja, 501480, 'Retired flat SZJA retained');
near(retiredFlat.totalTax, 551480, 'Retired flat SZJA plus HIPA');
near(retiredFlat.cashNet, 8448520, 'Retired flat cash after actual costs');
near(api.calculateFlat({ ...retired, skill: 'minimum' }).totalTax, 551480, 'Retired skill floor irrelevant');
near(api.calculateFlat({ ...retired, costCategory: '80', annualRevenue: 1200000 }).totalTax, 50000, 'Retired low income still pays selected HIPA');
near(api.calculateFlat({ ...retired, mode: 'draft' }).totalTax, 479480, 'Draft retired 50% costs, no contributions');
const retiredVszja = api.calculateVszja(retired);
near(retiredVszja.tb, 0, 'Retired VSZJA TB exemption');
near(retiredVszja.businessSzocho, 0, 'Retired VSZJA business szocho exemption');
near(retiredVszja.taxCosts, 50000, 'Retired estimated tax costs only HIPA');
near(retiredVszja.businessTaxBase, 8950000, 'Retired profit without exempt szocho deduction');
near(retiredVszja.dividendSzocho, 1007136, 'Retired VSZJA dividend szocho still due');
near(retiredVszja.totalTax, 3084311, 'Retired VSZJA full tax example');
const retiredWithdrawal = api.calculateVszja({ ...retired, annualRevenue: 12000000, monthlyExpenses: 200000, monthlyWithdrawal: 300000, otherIncome: 2000000 });
near(retiredWithdrawal.tb, 0, 'Retired positive withdrawal TB exempt');
near(retiredWithdrawal.businessSzocho, 0, 'Retired positive withdrawal business szocho exempt');
near(retiredWithdrawal.withdrawalSzja, 540000, 'Retired withdrawal SZJA retained');
near(retiredWithdrawal.businessTaxBase, 5950000, 'Retired costs and withdrawal deducted once');
near(retiredWithdrawal.remainingCap, 2147200, 'Retired exempt withdrawal still consumes dividend cap');
near(retiredWithdrawal.dividendSzocho, 279136, 'Retired remaining dividend cap tax');
near(api.calculateVszja({ ...retired, otherIncome: 7747200 }).dividendSzocho, 0, 'Retired other taxable income consumes cap');
equal(api.calculateKata({ ...retired, clients: 'private', taxi: true }).status, 'excluded', 'Current retired KATA excluded even for taxi');
equal(api.calculateKata({ ...retired, mode: 'draft', kataVersion: 'legacy', clients: 'private' }).status, 'excluded', 'Legacy retired KATA excluded');
const retiredKata = api.calculateKata({ ...retired, mode: 'draft', clients: 'private' });
equal(retiredKata.eligible, true, 'Draft new KATA pensioner eligible when other conditions satisfied');
near(retiredKata.flatTax, 600000, 'Draft pensioner 50k monthly flat tax');
near(retiredKata.totalTax, 650000, 'Draft pensioner B2C with HIPA');
near(api.calculateKata({ ...retired, mode: 'draft' }).supplement, 840000, 'Draft pensioner B2B supplementary credit');
equal(api.rankResults(api.calculateAll(retired))[0].id, 'flat', 'Retired verdict reflects no own contributions');
near(api.calculateKata(state({ mode: 'draft' })).totalTax, 1490000, 'Audit B2B draft total');
near(api.calculateKata(state({ mode: 'draft', employment: 'side', clients: 'private' })).totalTax, 650000, 'Side draft B2C');
near(api.calculateKata(state({ mode: 'draft', employment: 'side' })).supplement, 840000, 'Side draft B2B credit');
near(api.calculateKata(state({ mode: 'draft', annualRevenue: 22000000 })).totalTax, 3470000, '22M draft B2B');
near(api.calculateKata(state({ mode: 'draft', annualRevenue: 24000000 })).totalTax, 4270000, 'Above 22M no double supplementary tax');
near(api.calculateKata(state({ clients: 'private' })).totalTax, 650000, 'Current KATA 50k');
near(api.calculateKata(state({ mode: 'draft', kataVersion: 'legacy', clients: 'private' })).totalTax, 950000, 'Legacy 75k');
equal(api.calculateKata(state()).status, 'excluded', 'Current B2B excluded');
equal(api.calculateKata(state({ clients: 'private', employment: 'side' })).status, 'excluded', 'Current side excluded');
equal(api.calculateKata(state({ taxi: true })).status, 'eligible', 'Current taxi exception');
equal(api.calculateKata(state({ mode: 'draft', employerClient: true })).status, 'excluded', 'Draft employer excluded');
equal(api.calculateKata(state({ mode: 'draft', kataEligibility: 'unknown' })).status, 'unknown', 'Unknown basic eligibility');
const concentration = api.calculateKata(state({ mode: 'draft', largestPayer: 50 }));
equal(concentration.eligible, true, 'Concentration ends status at year end, not retroactively');
equal(concentration.notes.length, 1, 'Concentration consequence disclosed');

const mixed = state({ mode: 'draft', b2bShare: 50, annualRevenue: 30000000 });
const uncertain = api.calculateKata(mixed);
equal(uncertain.status, 'uncertain', 'Mixed excess requires allocation');
near(uncertain.taxRange[0], 5000000, 'Mixed lower tax bound');
near(uncertain.taxRange[1], 6050000, 'Mixed upper tax bound');
near(api.calculateKata({ ...mixed, excessShare: 0 }).totalTax, 6050000, 'Excess all private');
near(api.calculateKata({ ...mixed, excessShare: 100 }).totalTax, 5000000, 'Excess all B2B');
equal(api.calculateKata({ ...mixed, b2bShare: 95, excessShare: 0 }).status, 'uncertain', 'Impossible allocation rejected');
equal(api.calculateKata({ ...mixed, b2bShare: 10 }).status, 'eligible', 'No supplementary tax at either bound is exact');
equal(api.rankResults(api.calculateAll(mixed)).some(result => result.id === 'kata'), false, 'Uncertain KATA not ranked');

for (const regime of ['kata', 'flat', 'vszja']) {
  for (const [revenue, expected] of [[12000000,50000],[12000001,120000],[18000000,120000],[18000001,170000],[25000000,170000],[25000001,500000.02]]) {
    near(api.calculateHipa(state({ annualRevenue: revenue }), regime).hipa, expected, `HIPA ${regime} ${revenue}`);
  }
  near(api.calculateHipa(state({ annualRevenue: 19000000, hipaRate: 1, towns: 2 }), regime).hipa, 170000, 'Simplified per town');
  near(api.calculateHipa(state({ hipaMethod: 'normal', monthlyMaterials: 100000, towns: 3 }), regime).hipa, 168000, 'Normal apportioned base not multiplied by towns');
  near(api.calculateHipa(state({ hipaRate: 0 }), regime).hipa, 0, 'Zero local rate');
}
near(api.calculateHipa(state({ costCategory: '90', annualRevenue: 30000000 }), 'flat').hipa, 170000, 'Retail special HIPA limit');
near(api.calculateFlat(state({ employment: 'side', annualRevenue: 1936800 / .55 })).totalTax, 50000, 'Side taxable exemption plus HIPA');
near(api.calculateFlat(state({ employment: 'side', annualRevenue: 1936800 / .55 + 10000 })).totalTax, 50000 + 5500 * .465, 'Side taxable above exemption');
equal(api.calculateFlat(state({ annualRevenue: 38736001 })).eligible, false, 'Flat eligibility limit');
equal(api.calculateFlat(state({ annualRevenue: 40000000, costCategory: '90' })).eligible, true, 'Retail flat larger limit');
near(api.costRatio(state({ mode: 'draft' })), .5, '2027 general ratio');
near(api.yearParameters(state({ mode: 'draft', futureMin: 350000 })).minWage, 350000, 'Future wage assumption');

const vs = api.calculateVszja(state({ annualRevenue: 12000000, monthlyExpenses: 200000, monthlyWithdrawal: 300000, otherIncome: 2000000 }));
near(vs.withdrawalSzja, 540000, 'Withdrawal SZJA');
near(vs.businessSzocho, 582192, 'Business szocho floor');
near(vs.taxCosts, 632192, 'Szocho and HIPA deductible once');
near(vs.businessTaxBase, 5367808, 'Costs and withdrawal deductions');
near(vs.businessSzja, 483102.72, 'Business 9%');
near(vs.dividendBase, 4884705.28, 'Dividend base');
near(vs.remainingCap, 2147200, 'Other income and withdrawal consume cap');
near(vs.dividendSzocho, 279136, 'Remaining cap tax');
near(vs.cashNet, 12000000 - 2400000 - vs.totalTax, 'Withdrawal not deducted twice from cash');
const cap = state({ employment: 'side', annualRevenue: 30000000, hipaRate: 0, monthlyExpenses: 0, taxCostMode: 'actual', paidTaxCosts: 0 });
near(api.calculateVszja(cap).dividendSzocho, 1007136, '2026 full dividend cap');
near(api.calculateVszja({ ...cap, otherIncome: 7747200 }).dividendSzocho, 0, 'Cap fully consumed');
near(api.calculateVszja({ ...cap, monthlyWithdrawal: 700000 }).dividendSzocho, 0, 'Own withdrawal consumes cap');
const depreciation = api.calculateVszja({ ...cap, annualRevenue: 10000000, monthlyExpenses: 100000, costsLinked: false, deductibleCosts: 300000 });
near(depreciation.businessTaxBase, 9700000, 'Deductible costs separate from cash');
near(depreciation.annualCosts, 1200000, 'Cash costs preserved');
near(api.calculateVszja({ ...cap, annualRevenue: 10000000, loss: 9000000 }).lossUsed, 5000000, 'General loss cap');
const lowProfit = { ...cap, annualRevenue: 1200000, monthlyExpenses: 100000 };
near(api.calculateVszja(lowProfit).businessSzja, 2160, 'Income minimum 2% base');
near(api.calculateVszja(lowProfit).dividendBase, 21840, 'Dividend based on chosen minimum tax base');
near(api.calculateVszja({ ...lowProfit, minimumTreatment: 'declaration' }).businessSzja, 0, 'Declaration alternative');
near(api.calculateVszja({ ...lowProfit, minimumTreatment: 'exempt' }).businessSzja, 0, 'Minimum exception');
near(api.calculateVszja({ ...cap, paidTaxCosts: 500000 }).businessTaxBase, 29500000, 'Actual paid tax cost');
near(api.calculateVszja({ ...cap, profitAdjustment: -1000000, comparisonAdjustment: 100000 }).businessTaxBase, 29000000, 'Business correction');
near(api.calculateVszja({ ...cap, dividendAdjustment: -1000000 }).dividendBase, 26300000, 'Dividend correction');
equal(api.parseMoney('1 234 567'), 1234567, 'HU grouping');
equal(api.parseMoney('-123 456', true), -123456, 'Signed accounting value');
equal(Number.isNaN(api.parseMoney('<script>')), true, 'Invalid numeric input');

// Check algebraic events against direct tax calculations, and interval labels
// against dense revenue samples across eligibility and HIPA discontinuities.
let scenarios = 0, roots = 0;
for (const mode of ['current','draft']) for (const employment of ['full','side','retired'])
for (const costCategory of ['general','80','90']) for (const skill of ['minimum','guaranteed'])
for (const hipaMethod of ['normal','simplified']) for (const b2bShare of [0,25,50,100])
for (const excessShare of [null,0,50,100]) {
  const input = state({ mode, employment, costCategory, skill, hipaMethod, b2bShare, excessShare, clients: b2bShare ? 'mixed' : 'private' });
  const comparison = api.findBreakEven(input); scenarios++;
  for (const event of comparison.events) {
    if (event.type === 'equality') {
      const at = { ...input, annualRevenue: event.annualRevenue };
      near(api.calculateFlat(at).totalTax, api.calculateKata(at).totalTax, 'Algebraic equality', .001); roots++;
    }
  }
  for (let i = 0; i < 240; i++) {
    const revenue = (i + .381) * 30000000 / 240, at = { ...input, annualRevenue: revenue };
    const k = api.calculateKata(at), f = api.calculateFlat(at);
    const interval = comparison.intervals.find(item => revenue > item.low && revenue < item.high);
    assert.ok(interval, 'Covered revenue sample');
    const expected = !k.eligible || !f.eligible ? 'unavailable' : Math.abs(f.totalTax-k.totalTax) < 1e-6 ? 'tie' : f.totalTax > k.totalTax ? 'kata' : 'flat';
    equal(interval.winner, expected, `Interval verdict at ${revenue}`);
  }
}
console.log(`PASS: ${checks} assertions; ${scenarios} break-even scenarios; ${roots} algebraic equalities.`);
