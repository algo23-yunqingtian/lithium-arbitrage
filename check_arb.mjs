// 加工套利自检：实时拉 7 合约，计算 LC↔LI 双方向套利价差，并找出最活跃合约对
// 运行：node check_arb.mjs
const CONTRACTS = ['LC2705','LC2707','LC2709','LC2711','LI2707','LI2709','LI2711'];
const SINA = 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_=/';
const UA = { 'User-Agent': 'Mozilla/5.0' };
// 与 index.html / snapshot_daily.mjs 的 ARB 一致
const ARB = { MW_LH:42, MW_LC:37, COST_LC2LH:5000, COST_LH2LC:7000 };
const ratio = ARB.MW_LH / ARB.MW_LC;
const num = (v)=>{const n=parseFloat(v);return isNaN(n)?null:n;};
function strip(c){ const i=c.indexOf('var _='); if(i<0)return null; let s=c.slice(i+6); const a=s.indexOf('('),b=s.lastIndexOf(')'); if(a>=0&&b>a)s=s.slice(a+1,b); return s; }
function toArr(s){ if(s===null)return[]; const t=s.trim(); if(t.startsWith('null'))return[]; try{return JSON.parse(t);}catch(e){return[];} }
async function arr(url){ const r=await fetch(url,{headers:UA}); return toArr(strip(await r.text())); }

const q = {};
for (const c of CONTRACTS){
  const [intra, daily] = await Promise.all([
    arr(SINA+'InnerFuturesNewService.getMinLine?symbol='+c+'&type=1'),
    arr(SINA+'InnerFuturesNewService.getDailyKLine?symbol='+c),
  ]);
  const last = intra.length?intra[intra.length-1]:null;
  const dk = daily.length?daily[daily.length-1]:null;
  let dayVol = 0; for (const r of intra) dayVol += (num(r[3]) || 0);   // 日成交量 = 各分钟量求和
  q[c] = { price: num(last&&last[1]), vol: dayVol, pos: num(last&&last[4]),   // 持仓量 = 最后一根 idx4
           close: num(dk&&dk.c), settle: num(dk&&dk.s), o: num(dk&&dk.o) };
}
console.log('==== 实时行情（分时最新点） ====');
for (const c of CONTRACTS) console.log(`  ${c}  价=${q[c].price}  量=${q[c].vol}  仓=${q[c].pos}  昨结=${q[c].settle}  今开=${q[c].o}`);

const arb = (lc, li) => {
  const Plc = q[lc].price, Plh = q[li].price;
  if (Plc==null||Plh==null) return null;
  const c2hCost = ARB.COST_LC2LH*ratio;
  const pC2H = ratio*Plh - Plc - c2hCost;          // 元/吨LC
  const beC2H = (Plc + c2hCost)/ratio;             // 保本 LI 价
  const pH2C = Plc/ratio - Plh - ARB.COST_LH2LC;   // 元/吨LI
  const beH2C = (Plh + ARB.COST_LH2LC)*ratio;      // 保本 LC 价
  return { Plc, Plh, ratio, c2hCost, pC2H, beC2H, pH2C, beH2C };
};

const most = (arr) => arr.sort((a,b)=>(q[b].vol||0)-(q[a].vol||0))[0];
const mainLC = most(CONTRACTS.filter(c=>c.startsWith('LC')));
const mainLI = most(CONTRACTS.filter(c=>c.startsWith('LI')));

console.log('\n==== 加工套利（默认对 LC2705 × LI2707） ====');
const a1 = arb('LC2705','LI2707');
printArb('LC2705','LI2707', a1);
console.log('\n==== 加工套利（最活跃对 '+mainLC+' × '+mainLI+'） ====');
const a2 = arb(mainLC, mainLI);
printArb(mainLC, mainLI, a2);

function printArb(lc, li, a){
  if (!a){ console.log('  缺实时价'); return; }
  console.log(`  LC${lc.slice(2)}=${a.Plc}  LI${li.slice(2)}=${a.Plh}  理论比=${a.ratio.toFixed(4)}`);
  console.log(`  [碳转氢 LC→LI] 1tLC→${a.ratio.toFixed(3)}tLI  加工=${a.c2hCost.toFixed(1)}元  套利空间=${a.pC2H.toFixed(1)}元/吨LC  保本LI价=${a.beC2H.toFixed(0)}  ${a.pC2H>0?'✅有机会':'（无利）'}`);
  console.log(`  [氢转碳 LI→LC] 1tLI→${(1/a.ratio).toFixed(3)}tLC  加工=${ARB.COST_LH2LC}元  套利空间=${a.pH2C.toFixed(1)}元/吨LI  保本LC价=${a.beH2C.toFixed(0)}  ${a.pH2C>0?'✅有机会':'（无利）'}`);
}
