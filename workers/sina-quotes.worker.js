/**
 * Cloudflare Workers：新浪期货秒级盘口代理
 *
 * 作用：浏览器无法直连 hq.sinajs.cn（新浪强校验 Referer，非 finance.sina.com.cn 域名返回 403），
 *      本 Worker 在服务端带正确 Referer 转发，并把文本行情解析成 JSON 返回给前端。
 *
 * 部署后用法：
 *   GET https://<your-worker>.workers.dev/?symbols=LC2705,LC2707,LC2709,LI2707,LI2709
 *   → { "ts": 1732590000000, "source": "sina-hq", "quotes": { "LC2705": {...}, ... } }
 *
 * 环境变量（可选）：
 *   TOKEN  设置后前端必须带 ?tk=<TOKEN> 才能访问，防止免费额度被他人刷爆
 */

const SINA_LIST = 'https://hq.sinajs.cn/list=';
const UPSTREAM_HEADERS = {
  'Referer': 'https://finance.sina.com.cn',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};
const DEFAULT_SYMBOLS = 'LC2705,LC2707,LC2709,LI2707,LI2709';
const MAX_SYMBOLS = 30;

// 新浪 hq.sinajs.cn 期货字段下标（nf_<CODE> 序列）
const IDX = {
  name: 0, time: 1, open: 2, high: 3, low: 4, bid1: 6, ask1: 7, latest: 8,
  settle: 9, prevSettle: 10, bidVol1: 11, askVol1: 12, pos: 13, vol: 14,
  market: 15, variety: 16, date: 17, avg: 27, levelsStart: 28, levelsEnd: 43,
};

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

function extractRaw(text, code) {
  const key = 'var hq_str_nf_' + code + '="';
  const i = text.indexOf(key);
  if (i < 0) return null;
  const s = text.slice(i + key.length);
  const j = s.indexOf('"');
  if (j < 0) return null;
  return s.slice(0, j);
}

function parseQuote(code, text) {
  const raw = extractRaw(text, code);
  if (raw === null || raw === '') return null;
  const p = raw.split(',');
  const at = (i) => (i < p.length ? num(p[i]) : null);

  const open = at(IDX.open);
  const latest = at(IDX.latest);
  const rawPrev = at(IDX.prevSettle);
  const prevSettle = (rawPrev && rawPrev > 0) ? rawPrev : null;
  const base = prevSettle || open;
  const change = (base && latest !== null) ? +(latest - base).toFixed(1) : null;
  const pct = (base && change !== null) ? +(change / base * 100).toFixed(3) : null;

  const levels = [];
  for (let i = IDX.levelsStart; i + 1 <= IDX.levelsEnd && i + 1 < p.length; i += 2) {
    const pr = num(p[i]);
    if (pr === null) break;
    levels.push([pr, num(p[i + 1]) || 0]);
  }

  return {
    name: (p[IDX.name] || '').trim(),
    market: p[IDX.market] || '',
    variety: p[IDX.variety] || '',
    time: p[IDX.time] || '',
    date: p[IDX.date] || '',
    open, high: at(IDX.high), low: at(IDX.low), latest,
    bid1: at(IDX.bid1), ask1: at(IDX.ask1),
    bidVol1: at(IDX.bidVol1), askVol1: at(IDX.askVol1),
    settle: at(IDX.settle), prevSettle,
    pos: at(IDX.pos), vol: at(IDX.vol), avg: at(IDX.avg),
    base, change, pct,
    baseType: prevSettle ? 'settle' : 'open',
    levels,
  };
}

function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Cache-Control', 'no-store');
  return h;
}

function json(body, status) {
  const h = corsHeaders();
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

// 204 按 HTTP 规范不能带 body
function noContent() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return noContent();
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405);
    }

    if (env && env.TOKEN) {
      const tk = url.searchParams.get('tk');
      if (tk !== env.TOKEN) return json({ error: 'bad token' }, 401);
    }

    const raw = url.searchParams.get('symbols') || url.searchParams.get('s') || DEFAULT_SYMBOLS;
    const codes = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_SYMBOLS);
    if (!codes.length) return json({ error: 'no symbols' }, 400);

    let text;
    try {
      const r = await fetch(SINA_LIST + codes.map((c) => 'nf_' + c).join(','), {
        headers: UPSTREAM_HEADERS,
      });
      if (!r.ok) return json({ error: 'upstream http ' + r.status }, 502);
      text = await r.text();
    } catch (e) {
      return json({ error: 'upstream fetch failed: ' + (e && e.message ? e.message : String(e)) }, 502);
    }

    const quotes = {};
    for (const c of codes) {
      const q = parseQuote(c, text);
      if (q) quotes[c] = q;
    }

    return json({ ts: Date.now(), source: 'sina-hq', count: Object.keys(quotes).length, quotes }, 200);
  },
};

// 供自动化测试直接引用（浏览器/Workers 运行时忽略导出）
export { parseQuote, extractRaw, IDX };
