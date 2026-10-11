// Local Chrome smoke test. No npm packages. Run: node tests/browser.test.js
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.browser-audit-profile');
const chrome = process.env.EV_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket, nextId = 0, sessionId;
const pending = new Map(), errors = [];
let assertions = 0;
function check(value, message) { assertions++; assert.ok(value, message); }
function command(method, params = {}, session = sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
  });
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function screenshot(name) {
  const data = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(root, `.browser-audit-${name}.png`), Buffer.from(data.data, 'base64'));
}
(async () => {
  child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', error => errors.push(String(error)));
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  check(fs.existsSync(portFile), 'Chrome debugger started');
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    if (response.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(response.params.exceptionDetails));
    const request = pending.get(response.id);
    if (request) { clearTimeout(request.timer); pending.delete(response.id); response.error ? request.reject(Error(JSON.stringify(response.error))) : request.resolve(response.result); }
  });
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' }, null);
  ({ sessionId } = await command('Target.attachToTarget', { targetId, flatten: true }, null));
  await command('Runtime.enable'); await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1365, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Emulation.setEmulatedMedia', { features: [{name: 'prefers-color-scheme', value: 'light'}] });
  await command('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.getElementById("comparison-body")?.children.length > 1')) break;
    await delay(50);
  }
  await evaluate(`window.testChange = (id, value) => { const e=document.getElementById(id); e.value=value; e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); }; window.testRadio = (name,value) => document.querySelector('input[name="'+name+'"][value="'+value+'"]').click();`);
  check(await evaluate('document.getElementById("crossover-ratio").textContent.includes("45%")'), 'Default 2026 category');
  check(await evaluate('document.querySelector(".summary-card").textContent.includes("Nem alkalmazható")'), 'Default B2B current KATA excluded');
  check(await evaluate('!document.documentElement.textContent.includes("112,5%")'), 'No obsolete szocho claim');
  check(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Desktop no overflow');
  await screenshot('desktop');
  await evaluate('testRadio("employment","retired");');
  check(await evaluate('!document.getElementById("retired-note").hidden && document.getElementById("skill-fieldset").disabled'), 'Pensioner explanation visible and wage floor disabled');
  check(await evaluate('document.querySelector(".summary-card").textContent.includes("Nyugdíjas")'), 'Current pensioner KATA exclusion explained');
  check(await evaluate('document.getElementById("scenario-notes").textContent.includes("osztalékalapjának")'), 'Pensioner dividend szocho explained');
  const retiredRows = await evaluate('Array.from(document.getElementById("comparison-body").rows, row => Array.from(row.cells, cell => cell.textContent.replaceAll(" ","").replaceAll(String.fromCharCode(160),"").replaceAll(String.fromCharCode(8239),"")))');
  check(retiredRows.find(row => row[0].startsWith('TB-járulék')).slice(2).every(cell => cell==='0Ft'), 'Both pensioner income regimes have zero TB');
  check(retiredRows.find(row => row[0].startsWith('Szochoösszesen'))[2]==='0Ft' && retiredRows.find(row => row[0]==='Ebbőlosztalékszocho')[3]==='1007136Ft', 'Flat pensioner szocho zero but VSZJA dividend szocho retained');
  check(retiredRows.find(row => row[0]==='Összesadóésjárulék/év')[2]==='551480Ft', 'Pensioner hand-calculated flat total shown');
  await evaluate('testRadio("mode","draft"); testRadio("clients","private"); testChange("kata-eligibility","yes");');
  const draftRetiredRows = await evaluate('Array.from(document.getElementById("comparison-body").rows, row => Array.from(row.cells, cell => cell.textContent.replaceAll(" ","").replaceAll(String.fromCharCode(160),"").replaceAll(String.fromCharCode(8239),"")))');
  check(draftRetiredRows.find(row => row[0]==='KATAtételesadó')[1]==='600000Ft', 'Draft pensioner KATA uses 50k monthly');
  await evaluate('testChange("kata-version","legacy");');
  check(await evaluate('document.querySelector(".summary-card").textContent.includes("Nem alkalmazható")'), 'Pensioner cannot continue legacy KATA');
  await evaluate('document.getElementById("reset").click();');
  check(await evaluate('document.querySelector("input[name=employment][value=full]").checked && document.getElementById("retired-note").hidden'), 'Reset restores full-time from pensioner');
  await evaluate('testRadio("mode","draft"); document.querySelector("[data-open-field]").click();');
  check(await evaluate('document.getElementById("kata-eligibility").closest("details").open && document.activeElement.id==="kata-eligibility"'), 'Missing-data shortcut opens and focuses input');
  await evaluate('testChange("kata-eligibility","yes");');
  check(await evaluate('document.getElementById("crossover-ratio").textContent.includes("50%")'), 'Draft uses 50% category');
  check(await evaluate('document.getElementById("mode-notice").textContent.includes("Bérfeltételezésekkel")'), 'Future wages visibly estimated');
  check(await evaluate('document.getElementById("comparison-body").textContent.replaceAll(" ","").replaceAll(String.fromCharCode(160),"").replaceAll(String.fromCharCode(8239),"").includes("1490000Ft")'), 'Draft audit total in UI');
  check(await evaluate('document.getElementById("comparison-body").textContent.replaceAll(" ","").replaceAll(String.fromCharCode(160),"").replaceAll(String.fromCharCode(8239),"").includes("240000Ft")'), 'Supplementary tax row');
  await evaluate('testChange("largest-payer",50);');
  check(await evaluate('document.getElementById("scenario-notes").textContent.includes("év végén")'), 'Concentration year-end warning');
  check(await evaluate('!document.querySelector(".summary-card").classList.contains("unavailable")'), 'Concentration does not remove annual calculation');
  await evaluate('document.getElementById("employer-client").click();');
  check(await evaluate('document.querySelector(".summary-card").textContent.includes("Nem alkalmazható")'), 'Employer relationship excludes annual KATA');
  await evaluate('document.getElementById("employer-client").click(); testChange("largest-payer",40); testRadio("period","annual"); testChange("revenue","30 000 000"); testChange("b2b-share",50);');
  check(await evaluate('document.querySelector(".summary-card").textContent.includes("tartomány")'), 'Unknown excess shows range');
  check(await evaluate('document.getElementById("verdict-summary").textContent.includes("nem teljes körű")'), 'Incomplete verdict disclosed');
  check(await evaluate('document.getElementById("break-even-details").textContent.includes("Nem hasonlítható össze")'), 'Partial break-even scope disclosed');
  await evaluate('testChange("excess-share",50);');
  check(await evaluate('!document.querySelector(".summary-card").textContent.includes("Adat szükséges")'), 'Explicit allocation resolves KATA');
  await evaluate('testChange("b2b-share",95); testChange("excess-share",0);');
  check(await evaluate('document.querySelector(".summary-card").textContent.includes("Adat szükséges")'), 'Impossible allocation cannot produce recommendation');
  await evaluate('testChange("excess-share",95); testChange("other-income","7 747 200"); testChange("withdrawal","300 000");');
  check(await evaluate('document.getElementById("other-income").getAttribute("aria-invalid")==="false"'), 'Other income accepted');
  await evaluate('testChange("revenue","10 000 001"); testRadio("period","monthly"); document.getElementById("revenue").dispatchEvent(new Event("blur")); testRadio("period","annual");');
  check(await evaluate('document.getElementById("revenue").value.replaceAll(" ","").replaceAll(String.fromCharCode(160),"").replaceAll(String.fromCharCode(8239),"")==="10000001"'), 'Annual amount preserved through monthly conversion and blur');
  await evaluate('testChange("expenses","invalid");');
  check(await evaluate('document.getElementById("export").disabled'), 'Invalid input blocks export');
  await evaluate('testChange("expenses","50 000");');
  check(await evaluate('!document.getElementById("export").disabled'), 'Valid input restores export');
  await evaluate(`testRadio('employment','retired'); window.testBlob=null; const create=URL.createObjectURL; URL.createObjectURL=b=>{window.testBlob=b;return create(b)}; HTMLAnchorElement.prototype.click=function(){}; document.getElementById('export').click();`);
  const csv = await evaluate('testBlob.text()');
  check(csv.includes('2027') && csv.includes('feltételezett') && csv.includes('otherIncome') && csv.includes('KATA kiegészítő'), 'CSV includes mode, assumptions, full inputs and supplement');
  check(csv.includes('Nyugdíjas, kiegészítő') && csv.includes('osztalékszocho felmerülhet'), 'CSV records pensioner status and exemption scope');
  await evaluate('document.getElementById("reset").click();');
  check(await evaluate('document.getElementById("revenue").value.replaceAll(" ","").replaceAll(String.fromCharCode(160),"").replaceAll(String.fromCharCode(8239),"")==="800000"'), 'Reset revenue');
  check(await evaluate('document.getElementById("draft-settings").hidden'), 'Reset mode');
  for (const width of [320,390,768]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    check(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `No overflow at ${width}px`);
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate('testRadio("employment","retired"); document.getElementById("retired-note").scrollIntoView({behavior:"instant",block:"center"});');
  check(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Pensioner explanation fits mobile');
  await screenshot('mobile');
  await evaluate('document.getElementById("theme-toggle").click(); document.getElementById("summary-cards").scrollIntoView({behavior:"instant"});');
  check(await evaluate('document.documentElement.dataset.theme==="dark"'), 'Dark theme');
  await screenshot('dark');
  check(errors.length===0, `No browser errors: ${errors.join(';')}`);
  console.log(`PASS: ${assertions} browser assertions; desktop/mobile layouts, inputs, eligibility, export, theme.`);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close', {}, null); } catch { /* Chrome may close before responding. */ } socket.close(); }
  if (child && child.exitCode === null) { await delay(1000); if (child.exitCode===null) child.kill(); }
  await delay(500);
  if (path.dirname(profile) === root && path.basename(profile)==='.browser-audit-profile') {
    try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300}); } catch { /* Report retained profile through filesystem listing. */ }
  }
});
