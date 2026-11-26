// 真实数据 e2e：用与 index.html 完全相同的解析逻辑，直接打新浪真实接口
const CONTRACTS = ['LC2705','LC2707','LC2709','LC2711','LI2707','LI2709','LI2711'];
const SINA = 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_=/';
const UA = { 'User-Agent': 'Mozilla/5.0' };

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const fmt = (n, d=1) => (n===null||n===undefined) ? '—' : Number(n).toFixed(d);
function strip(c){
  const i = c.indexOf('var _=');
  if (i < 0) throw new Error('响应无 var _= 前缀，可能被反爬拦截: ' + c.slice(0,80));
  let s = c.slice(i + 'var _='.length);
  const a = s.indexOf('('), b = s.lastIndexOf(')');
  if (a >= 0 && b > a) s = s.slice(a + 1, b);
  return s;
}
const todayStr = () => { const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); };
const BASE_LABEL = { settle:'昨结', prevClose:'昨收', open:'开盘' };
const today = todayStr();

// 与 index.html resolveBase 完全一致
function resolveBase(code, daily, kline, intraday){
  const d = daily[code];
  if (Array.isArray(d) && d.length){
    const past = d.filter(b => String(b.d) < today);
    const b = past.length ? past[past.length-1] : d[d.length-1];
    const s = num(b && b.s);
    if (s) return { v:s, t:'settle' };
    const c = num(b && b.c);
    if (c && past.length) return { v:c, t:'prevClose' };
  }
  const k = kline[code];
  if (Array.isArray(k) && k.length){
    const past = k.filter(b => String(b.d).slice(0,10) < today);
    if (past.length){ const c=num(past[past.length-1].c); if (c) return { v:c, t:'prevClose' }; }
  }
  const rows = intraday[code];
  if (Array.isArray(rows) && rows.length){ const o=num(rows[0][1]); if (o) return { v:o, t:'open' }; }
  return { v:null, t:null };
}

let pass = true;
const ok = (n,c,e='') => { console.log((c?'PASS':'FAIL')+' | '+n+(e?(' | '+e):'')); if(!c) pass=false; };

for (const code of CONTRACTS) {
  const [intr, kl, dl] = await Promise.all([
    fetch(SINA+'InnerFuturesNewService.getMinLine?symbol='+code+'&type=1', { headers: UA }),
    fetch(SINA+'InnerFuturesNewService.getFewMinLine?symbol='+code+'&type=1', { headers: UA }),
    fetch(SINA+'InnerFuturesNewService.getDailyKLine?symbol='+code, { headers: UA }),
  ]);
  const it = await intr.text(), kk = await kl.text(), dd = await dl.text();
  const toArr = (s) => s.includes('var _=(null)') ? [] : JSON.parse(strip(s));
  const rows = toArr(it), k2 = toArr(kk), d2 = toArr(dd);
  const intraday = { [code]: rows }, kline = { [code]: k2 }, daily = { [code]: d2.length ? d2 : null };

  const base = resolveBase(code, daily, kline, intraday);
  const last = rows[rows.length-1], first = rows[0];
  const price = num(last[1]), avg = num(last[2]);
  let dayVol = 0; for (const r of rows) dayVol += (num(r[3]) || 0);   // 日成交量 = 各分钟量求和（getMinLine idx3）
  const pos = num(last[4]);                                            // 持仓量 = 最后一根 idx4
  const vol = dayVol;
  const chg = (price!==null && base.v!==null) ? price - base.v : null;
  const pct = (chg!==null && base.v) ? (chg/base.v)*100 : null;

  ok(code+' 分时数据非空(>=5根，新上市/极不活跃合约可少)', rows.length >= 5, 'bars='+rows.length);
  ok(code+' 分时末根时间合法(HH:MM)', /^\d{2}:\d{2}$/.test(String(last[0]||'')), 'last[0]='+last[0]);
  ok(code+' 涨跌基准已解析', base.v !== null, 'base='+base.t+'('+BASE_LABEL[base.t]+')='+fmt(base.v));
  ok(code+' 卡片值完整', price!==null && avg!==null && pos!==null && vol!==null && chg!==null,
    `最新=${fmt(price)} ${base.t?'较'+BASE_LABEL[base.t]:''}涨跌=${fmt(chg)}(${fmt(pct,2)}%) 开=${fmt(num(first[1]))} 均=${fmt(avg)} 持仓=${pos} 量=${vol}`);
  console.log('');
}
console.log(pass ? '=== 真实数据全部通过 ===' : '=== 存在失败 ===');
process.exit(pass ? 0 : 1);
