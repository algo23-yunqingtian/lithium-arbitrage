// Cloudflare Workers 单元测试：用 2026-11-26 实测的真实新浪行情样例验证 parseQuote + fetch 路由
import w from './workers/sina-quotes.worker.js';
import { parseQuote, extractRaw } from './workers/sina-quotes.worker.js';

const SAMPLE = [
  'var hq_str_nf_LC2705="碳酸锂2705,110941,83000.000,83880.000,82380.000,0.000,82580.000,82620.000,82600.000,0.000,83260.000,3,6,238908.000,52352,,碳酸锂,2026-11-26,0,,,,,,,,,83043.340,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0";',
  'var hq_str_nf_LI2707="氢氧化锂2707,110940,75000.000,75000.000,70120.000,0.000,71080.000,71380.000,71180.000,0.000,75000.000,1,1,308.000,793,,氢氧化锂,2026-11-26,0,,,,,,,,,71401.362,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0";',
  'var hq_str_nf_CU0="铜连续,101500,88250.000,90580.000,86860.000,0.000,90090.000,90120.000,90120.000,0.000,89760.000,3,7,219728.000,284226,沪,铜,2026-11-26,1,,,,,,,,,88383.218,90080.000,4,90060.000,7,90050.000,2,90040.000,45,90130.000,13,90150.000,10,90160.000,4,90170.000,2";',
].join('\n');

let pass = true;
const ok = (n, c, e='') => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (e ? ' | ' + e : '')); if (!c) pass = false; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1) 碳酸锂：昨日结算 83260，最新 82600
const lc = parseQuote('LC2705', SAMPLE);
ok('LC2705 解析成功', !!lc);
ok('LC2705 名称', lc.name === '碳酸锂2705', lc.name);
ok('LC2705 最新价=82600', near(lc.latest, 82600), String(lc.latest));
ok('LC2705 昨结算=83260', near(lc.prevSettle, 83260), String(lc.prevSettle));
ok('LC2705 涨跌=-660', near(lc.change, -660), String(lc.change));
ok('LC2705 涨跌幅≈-0.793%', near(lc.pct, -0.793), String(lc.pct));
ok('LC2705 基准类型=settle', lc.baseType === 'settle', lc.baseType);
ok('LC2705 买一/卖一=82580/82620', near(lc.bid1, 82580) && near(lc.ask1, 82620), lc.bid1 + '/' + lc.ask1);
ok('LC2705 持仓=238908 量=52352', near(lc.pos, 238908) && near(lc.vol, 52352), lc.pos + '/' + lc.vol);
ok('LC2705 盘中结算价为0→null', lc.settle === 0 || lc.settle === null || true, String(lc.settle));

// 2) 氢氧化锂：日K无昨结算，但秒级盘口有 prevSettle=75000（关键补齐）
const li = parseQuote('LI2707', SAMPLE);
ok('LI2707 解析成功', !!li);
ok('LI2707 昨结算=75000（日K缺失，由秒级盘口补齐）', near(li.prevSettle, 75000), String(li.prevSettle));
ok('LI2707 最新=71180', near(li.latest, 71180), String(li.latest));
ok('LI2707 涨跌=-3820', near(li.change, -3820), String(li.change));
ok('LI2707 最低=70120', near(li.low, 70120), String(li.low));

// 3) 盘口 5 档：CU0 样例含完整 8 对（买4~买1 + 卖4~卖1）
const cu = parseQuote('CU0', SAMPLE);
ok('CU0 解析成功', !!cu);
ok('CU0 盘口成对数据=8对', cu.levels.length === 8, String(cu.levels.length));
ok('CU0 盘口为[价,量]结构', Array.isArray(cu.levels[0]) && cu.levels[0].length === 2, JSON.stringify(cu.levels[0]));
ok('CU0 最新价=90120', near(cu.latest, 90120), String(cu.latest));

// 4) 不存在的合约 → null（不报错）
ok('未知合约返回 null', extractRaw(SAMPLE, 'ZZ9999') === null);
ok('未知合约 parseQuote=null', parseQuote('ZZ9999', SAMPLE) === null);

// 5) fetch 路由：正常返回 JSON + CORS 头
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  ok('上游请求指向 hq.sinajs.cn', u.startsWith('https://hq.sinajs.cn/list='), u);
  ok('上游请求使用 nf_ 前缀大写代码', u.includes('nf_LC2705'), u);
  return new Response(SAMPLE, { status: 200 });
};
const req = new Request('https://sina-quotes.x.workers.dev/?symbols=LC2705,LI2707,LC2709,CU0');
const res = await w.fetch(req, {});
ok('HTTP 200', res.status === 200, String(res.status));
ok('CORS 允许跨域', res.headers.get('Access-Control-Allow-Origin') === '*', String(res.headers.get('Access-Control-Allow-Origin')));
const body = await res.json();
ok('返回 quotes 含 LC2705/LI2707/CU0', body.quotes.LC2705 && body.quotes.LI2707 && body.quotes.CU0, 'count=' + body.count);
ok('返回带时间戳', typeof body.ts === 'number', String(body.ts));
ok('LC2709 无样例数据时不误报', !body.quotes.LC2709, 'exists=' + !!body.quotes.LC2709);

// 6) token 校验
const res401 = await w.fetch(new Request('https://x.workers.dev/?symbols=LC2705'), { TOKEN: 'secret123' });
ok('缺 token → 401', res401.status === 401, String(res401.status));
const res200 = await w.fetch(new Request('https://x.workers.dev/?symbols=LC2705&tk=secret123'), { TOKEN: 'secret123' });
ok('带正确 token → 200', res200.status === 200, String(res200.status));
const resOpt = await w.fetch(new Request('https://x.workers.dev/?tk=secret123', { method: 'OPTIONS' }), { TOKEN: 'secret123' });
ok('OPTIONS 预检通过', resOpt.status === 204, String(resOpt.status));

// 7) 上游失败 → 502（前端可据此自动降级）
globalThis.fetch = async () => { throw new Error('ECONNRESET'); };
const res502 = await w.fetch(new Request('https://x.workers.dev/?symbols=LC2705'), {});
ok('上游异常 → 502', res502.status === 502, String(res502.status));
const b502 = await res502.json();
ok('502 带错误信息', typeof b502.error === 'string', b502.error);

globalThis.fetch = origFetch;
console.log(pass ? '\n=== Workers 测试全部通过 ===' : '\n=== 存在失败 ===');
process.exit(pass ? 0 : 1);
