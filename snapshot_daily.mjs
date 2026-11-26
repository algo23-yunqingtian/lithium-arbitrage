// 快照：抓取 7 合约当日日K + 分时最新 + 加工套利，写入 data/history.json（长期存档）+ data/intraday.json（日内快照）
// 由 .github/workflows/daily-snapshot.yml 定时在 GitHub 云端执行（无 token，GITHUB_TOKEN 推送，workflow 内已声明 contents:write）
// GitHub 仓库即长期云数据库：每天一个版本（可回溯任意一天，一年后仍可恢复今天的价格）；盘中多次快照补日内粒度。
import fs from 'fs';
import path from 'path';

const CONTRACTS = ['LC2705','LC2707','LC2709','LC2711','LI2707','LI2709','LI2711'];
const SINA_HOSTS = ['stock2.finance.sina.com.cn','stock.finance.sina.com.cn'];  // 多源降级：主源失败自动切备用源
const UA = { 'User-Agent': 'Mozilla/5.0' };

// ==== 加工套利参数（与 index.html 的 ARB 保持一致；改这里后同步 index.html） ====
const ARB = { MW_LH: 42, MW_LC: 37, COST_LC2LH: 5000, COST_LH2LC: 7000 };
const ratio = ARB.MW_LH / ARB.MW_LC;

function strip(c){
  const i = c.indexOf('var _=');
  if (i < 0) return null;
  let s = c.slice(i + 'var _='.length);
  const a = s.indexOf('('), b = s.lastIndexOf(')');
  if (a >= 0 && b > a) s = s.slice(a + 1, b);
  return s;
}
function toArr(s){ if (s===null) return []; const t = s.trim(); if (t.startsWith('null')) return []; try { return JSON.parse(t); } catch(e){ return []; } }
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

async function fetchArr(ep){
  for (const host of SINA_HOSTS){
    try {
      const r = await fetch('https://' + host + '/futures/api/jsonp.php/var%20_=/' + ep, { headers: UA });
      const arr = toArr(strip(await r.text()));
      if (arr.length) return arr;
    } catch(e){ /* 切备用源 */ }
  }
  return [];
}

async function main(){
  const n = new Date();
  const pad = (x) => String(x).padStart(2,'0');
  const dateStr = n.getFullYear() + '-' + pad(n.getMonth()+1) + '-' + pad(n.getDate());
  const timeStr = pad(n.getHours()) + ':' + pad(n.getMinutes());
  const quotes = {};
  for (const c of CONTRACTS){
    const daily = await fetchArr('InnerFuturesNewService.getDailyKLine?symbol=' + c);
    const dk = daily.length ? daily[daily.length-1] : null;
    const intra = await fetchArr('InnerFuturesNewService.getMinLine?symbol=' + c + '&type=1');
    const last = intra.length ? intra[intra.length-1] : null;
    // getMinLine 行 = [time, price, avg, 分钟成交量, 持仓量]：日成交量=各分钟量求和，持仓量=最后一根 idx4
    let dayVol = 0; for (const r of intra) dayVol += (num(r[3]) || 0);
    quotes[c] = {
      date: dk ? String(dk.d) : dateStr,
      o: num(dk&&dk.o), h: num(dk&&dk.h), l: num(dk&&dk.l), c: num(dk&&dk.c),
      v: num(dk&&dk.v), p: num(dk&&dk.p), s: num(dk&&dk.s),
      live: num(last&&last[1]), liveVol: dayVol, livePos: num(last&&last[4]),
    };
  }
  // 加工套利：LC 近月 vs LI 近月（主参考对）
  const lc = quotes['LC2705'], lh = quotes['LI2707'];
  const c2hCost = ARB.COST_LC2LH * ratio;
  const arb = {
    ratio: +ratio.toFixed(4), costLC2LH: ARB.COST_LC2LH, costLH2LC: ARB.COST_LH2LC,
    LC2705: lc.c, LI2707: lh.c,
    lc2lh_profit: (lc.c!=null && lh.c!=null) ? +(ratio*lh.c - lc.c - c2hCost).toFixed(1) : null,
    lh2lc_profit: (lc.c!=null && lh.c!=null) ? +(lc.c/ratio - lh.c - ARB.COST_LH2LC).toFixed(1) : null,
  };

  // 空数据保护：主源+备用源全部失败时不写垃圾记录
  const anyData = CONTRACTS.some(c => quotes[c].c != null);
  if (!anyData){ console.log('ALL SOURCES FAILED — skip write (date=' + dateStr + ')'); return; }

  // ==== 长期存档：每日快照（data/history.json） ====
  const histPath = path.join('data', 'history.json');
  fs.mkdirSync('data', { recursive: true });
  let hist = { contracts: CONTRACTS, arb: { ratio:+ratio.toFixed(4), costLC2LH:ARB.COST_LC2LH, costLH2LC:ARB.COST_LH2LC }, days: [] };
  if (fs.existsSync(histPath)){ try { hist = JSON.parse(fs.readFileSync(histPath,'utf8')); } catch(e){} }
  hist.contracts = CONTRACTS;   // 合约列表始终与代码同步（加载旧文件后强制覆盖）
  hist.arb = { ratio:+ratio.toFixed(4), costLC2LH:ARB.COST_LC2LH, costLH2LC:ARB.COST_LH2LC };
  const day = { date: dateStr, quotes, arb };
  const idx = hist.days.findIndex(d => d.date === dateStr);
  if (idx >= 0) hist.days[idx] = day; else hist.days.push(day);
  if (hist.days.length > 1300) hist.days = hist.days.slice(-1300);   // 约 5 年上限
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 1));

  // ==== 日内快照（data/intraday.json）：每次运行追加一个点，滚动保留最近 240 点（约 60 交易日） ====
  const intraPath = path.join('data', 'intraday.json');
  let intra = { points: [] };
  if (fs.existsSync(intraPath)){ try { const j = JSON.parse(fs.readFileSync(intraPath,'utf8')); if (j && Array.isArray(j.points)) intra = j; } catch(e){} }
  intra.points.push({ date: dateStr, time: timeStr, lcCode:'LC2705', liCode:'LI2707',
    lc: arb.LC2705, lh: arb.LI2707, lc2lh_profit: arb.lc2lh_profit, lh2lc_profit: arb.lh2lc_profit,
    ts: n.toISOString() });
  if (intra.points.length > 240) intra.points = intra.points.slice(-240);
  fs.writeFileSync(intraPath, JSON.stringify(intra, null, 1));

  console.log('date =', dateStr, timeStr);
  for (const c of CONTRACTS) console.log('  ', c, JSON.stringify(quotes[c]));
  console.log('  arb =', JSON.stringify(arb));
  console.log('  history days =', hist.days.length, ' intraday points =', intra.points.length);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
