# 秒级盘口代理（Cloudflare Workers）

## 为什么需要它

新浪有两套行情接口，访问条件不同：

| 接口 | 内容 | 浏览器能否直连 |
|---|---|---|
| `stock2.finance.sina.com.cn` JSONP | 分时、分钟K线、日K线 | ✅ 可以（不校验 Referer），本项目默认用它 |
| `hq.sinajs.cn` | **秒级盘口五档**（最新价、买卖五档、量仓） | ❌ **不行**——强校验 `Referer`，非 `finance.sina.com.cn` 域名一律返回 **403** |

所以：**分钟级 K 线 + 分时纯前端就能做**；想要**秒级 tick**，必须有一层服务端带正确 Referer 去请求。这一层用 Cloudflare Workers 最省——**免费、Serverless、没有服务器可运维**。

附带好处：`hq.sinajs.cn` 对**氢氧化锂(LI)** 能返回昨结算价（新浪日K 接口对 LI 返回 `null`），所以启用秒级模式后，LI 合约的涨跌基准会从"较开盘"升级为"较昨结"。

## 部署（约 3 分钟，无需买服务器）

### 方式一：命令行（推荐）

```bash
npm i -g wrangler          # Cloudflare 官方 CLI
wrangler login             # 浏览器登录 cloudflare.com 账号
wrangler versions deploy workers/sina-quotes.worker.js --name sina-quotes
# 或本地迭代调试：
wrangler dev workers/sina-quotes.worker.js
```

### 方式二：纯网页

1. 登录 `https://dash.cloudflare.com` → Workers & Pages → Create Worker
2. 粘贴 `sina-quotes.worker.js` 全部内容，Deploy
3. 拿到形如 `https://sina-quotes.<你的子域>.workers.dev` 的地址

### （可选）设置访问令牌，防止免费额度被刷

Workers 免费额度是 **10 万次请求/天**。若不希望别人免费蹭你的代理：

设置变量 `TOKEN`：
```bash
wrangler secret put TOKEN      # 输入任意随机字符串
```
然后在 `index.html` 顶部同步填 `WORKER_TOKEN`。设置后不带 `?tk=<TOKEN>` 的请求一律 401。

## 页面接入

编辑 `index.html` 顶部：

```js
const WORKER_URL   = 'https://sina-quotes.<你的子域>.workers.dev';  // 留空 = 纯分钟级
const WORKER_TOKEN = '';            // 与 TOKEN 变量一致
const SEC_MS       = 1500;          // 秒级轮询间隔
```

效果：报价卡片切换为**秒级盘口**（带"秒级"标记、显示买一/卖一），状态栏显示"秒级盘口(Workers)"。**连续失败 3 次自动降级回分钟级**，不会白屏。

## 接口

```
GET https://<worker>?symbols=LC2705,LC2707,LC2709,LI2707,LI2709[&tk=<TOKEN>]

200 → {
  "ts": 1732590000000, "source": "sina-hq", "count": 5,
  "quotes": {
    "LC2705": {
      "name":"碳酸锂2705", "time":"110941", "date":"2026-11-26",
      "open":83000, "high":83880, "low":82380, "latest":82600,
      "bid1":82580, "ask1":82620, "bidVol1":3, "askVol1":6,
      "prevSettle":83260, "pos":238908, "vol":52352, "avg":83043.34,
      "change":-660, "pct":-0.793, "baseType":"settle",
      "levels":[[90080,4], ...]
    }
  }
}
```

- `prevSettle` 为 0 或缺失时自动回退开盘价，`baseType` 标明基准来源
- 上游异常 → `502`（前端据此降级）

## 容量核算（免费额度内）

| 轮询间隔 | 每合约请求量/天 | 免费额度(10万) |
|---|---|---|
| 5 秒 | 2.88 万 | 余量充足 |
| 1.5 秒 | 9.6 万 | 勉强够（单用户） |
| 1 秒 | 8.64 万 | 够，但多人访问会超 |

> 多人访问请改 3-5 秒间隔，或升级到 Workers Paid（$5/月起）。

## 本地测试

```bash
node check_worker.mjs     # 用 2026-11-26 实测的真实新浪行情样例验证解析 + 路由
```
