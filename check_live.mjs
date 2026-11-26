// 临时验证脚本：mock 浏览器环境跑通 index.html 的内联 JS，验证语法+渲染逻辑
import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
if (!m) { console.error('NO inline script found'); process.exit(1); }
const code = m[1];

const mockData = {
  intraday: [["09:00","82000","83000","1000","500","0","2026-11-26"],["09:01","82100","83100","1100","600","0","2026-11-26"]],
  kline: [
    {d:"2026-11-26 09:00:00",o:82000,h:82500,l:81900,c:82100,v:500,p:1000},
    {d:"2026-11-26 09:01:00",o:82100,h:82600,l:82000,c:82200,v:600,p:1100},
    {d:"2026-11-26 09:02:00",o:82200,h:82700,l:82100,c:82300,v:700,p:1200},
    {d:"2026-11-26 09:03:00",o:82300,h:82800,l:82200,c:82400,v:800,p:1300},
  ],
  daily: [{d:"2026-11-25",o:83000,h:83500,l:82800,c:83200,v:10000,p:100000,s:83260}],
};

function makeEl(){
  const el = {
    _html:'', textContent:'', value:'', className:'', dataset:{}, children:[],
    classList:{ add(){}, remove(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); return c; },
    add(){}, setAttribute(){}, remove(){},
    querySelectorAll(){ return []; },
  };
  // 模拟真实 DOM：innerHTML='' 清空子节点
  Object.defineProperty(el, 'innerHTML', {
    get(){ return this._html; },
    set(v){ this._html = v; if (v === '') this.children.length = 0; },
  });
  return el;
}
const els = new Map();
function getEl(id){ if (!els.has(id)) els.set(id, makeEl()); return els.get(id); }

const sandbox = {
  console, Math, Date, isNaN, parseInt, parseFloat, Number, String, Array, Map, Promise,
  setTimeout, setInterval: ()=>0, clearInterval: ()=>{},
  Option: class { constructor(t,v){ this.text=t; this.value=v; } },
  window: { addEventListener(){}, _: undefined },
  echarts: { init: () => ({ setOption(){}, resize(){} }) },
  document: {
    createElement: () => makeEl(),
    getElementById: getEl,
    head: {
      appendChild(s){
        const url = s.src || '';
        let d = null;
        if (url.includes('getMinLine')) d = mockData.intraday;
        else if (url.includes('getFewMinLine')) d = mockData.kline;
        else if (url.includes('getDailyKLine')) d = mockData.daily;
        sandbox.window._ = d;
        setTimeout(() => s.onload(), 0);
      },
    },
    addEventListener(ev, cb){ if (ev === 'DOMContentLoaded') setTimeout(() => cb(), 0); },
    querySelectorAll(){ return []; },
  },
};
vm.createContext(sandbox);

try {
  vm.runInContext(code, sandbox);
} catch(e){
  console.error('SYNTAX/START ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
}

await new Promise(r => setTimeout(r, 2000)); // 等串行 jsonp 链 + 渲染完成

const cards = els.get('cards');
const status = els.get('status');
const spreadLatest = els.get('spread-latest');
let pass = true;

const check = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL') + ' | ' + name + (extra?(' | '+extra):'')); if(!cond) pass=false; };

check('内联JS 语法+启动无异常', true);
check('已移除 delete window._（严格模式下抛错会导致数据链路挂死）', !code.includes('delete window._'));
check('ECharts 国内CDN优先（npmmirror）', code.includes('npmmirror'));
check('周期切换含 1/3/5/15/30/60/日K', ['1','3','5','15','30','60','daily'].every(t => html.includes('data-t="'+t+'"')));
check('已集成秒级盘口（fetchSec + Workers）', code.includes('async function fetchSec') && code.includes('WORKER_URL'));
check('WORKER_URL 默认留空 = 不启用秒级（纯分钟级不受影响）', /const WORKER_URL\s*=\s*''/.test(code));
check('秒级失败自动降级为分钟级', code.includes('已降级为分钟级'));
check('LI 缺失昨结算由秒级盘口补齐', code.includes('state.baseType[c.code] = \'settle\''));
check('实时卡片渲染数量 = 5', cards.children.length === 5, `got ${cards.children.length}`);
check('状态栏有更新时间', (status.textContent||'').includes('更新'), status.textContent);
check('价差最新值已更新', spreadLatest.textContent && spreadLatest.textContent !== '—', spreadLatest.textContent);

// ==== 新增：加工套利 / 持仓副图 / 缩放滑块 / 历史快照 ====
check('加工套利面板已加入（LC↔LI 双方向卡片）', html.includes('id="arb-lc2lh"') && html.includes('id="arb-lh2lc"'));
check('加工套利 a/b 变量可配置（分子量+加工费）', code.includes('MW_LH: 42') && code.includes('MW_LC: 37') && code.includes('COST_LC2LH: 5000') && code.includes('COST_LH2LC: 7000'));
check('加工套利 1t LC→ratio t LI 换算（42/37）', code.includes('const arbRatio = () => ARB.MW_LH / ARB.MW_LC'));
check('加工套利双方向含系数（转碳酸锂乘/除系数）', code.includes('ratio*Plh - Plc') && code.includes('Plc/ratio - Plh'));
check('K线含持仓副图（.p 字段，实时）', code.includes("rows.map(r => num(r.p)||0)") && code.includes("name:'持仓'"));
check('K线含成交量副图（.v 字段）', code.includes("rows.map(r => num(r.v)||0)"));
check('K线默认显示更多根 + 缩放滑块（dataZoom slider）', code.includes("type:'slider'") && code.includes('defStart'));
check('每日快照历史加载（fetch data/history.json，缺失自动忽略）', code.includes("loadHistory") && code.includes("HISTORY_PATH"));
check('历史加载有 fetch 守卫（mock 环境不炸）', code.includes("typeof fetch !== 'function'"));
check('snapshot_daily.mjs 每日快照脚本存在', fs.existsSync('snapshot_daily.mjs'));
check('GitHub Actions 每日快照工作流存在', fs.existsSync('.github/workflows/daily-snapshot.yml'));
check('P0: 跟随主力合约开关（arb-auto）', html.includes('id="arb-auto"'));
check('P0: 自动选最活跃合约（mostActive 按量）', code.includes('function mostActive'));
check('P0: 套利机会徽标（arb-lc2lh-flag/arb-lh2lc-flag）', html.includes('id="arb-lc2lh-flag"') && html.includes('id="arb-lh2lc-flag"'));
check('P0: 套利面板显示 LC/LI 量仓', code.includes('量/仓') && code.includes('lastVolPos'));
check('check_arb.mjs 套利自检脚本存在', fs.existsSync('check_arb.mjs'));

console.log(pass ? '\n=== 全部通过 ===' : '\n=== 存在失败 ===');
process.exit(pass ? 0 : 1);
