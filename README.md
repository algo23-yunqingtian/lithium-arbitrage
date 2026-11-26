# lithium-arbitrage · 锂期货实时看板

> 仓库：lgo23-yunqingtian/lithium-arbitrage（GitHub Pages 静态看板，锂期货分时跟踪 + 跨期/跨品种价差）


纯静态单页，用于**实时跟踪锂期货分时状态**：分钟级别 K 线 + 当日分时 + 实时报价卡片 + 跨期/跨品种价差。

- 数据源：**新浪财经期货行情接口**（免费、无需 token、JSONP 跨域直连）
- 技术栈：原生 HTML/CSS/JS + ECharts 5（国内 CDN 优先，多级降级）
- 部署：GitHub Pages（纯静态，零后端，零构建）

## 页面功能

| 模块 | 说明 |
|---|---|
| 实时报价卡片 | 5 个合约：最新价、涨跌(自动基准)、涨跌幅、今开/最高/最低、当日均价、持仓、成交量。卡片标注基准类型（较昨结/较昨收/较开盘） |
| 分钟 K 线 | **1 / 3 / 5 / 15 / 30 / 60 分 + 日K** 七档周期切换，MA5/MA10/MA20 + 成交量副图，滚轮缩放 |
| 当日分时 | 价格线 + 当日均价线 + 昨结算/基准虚线 |
| 价差监控 | 任意两合约（默认 LC2705−LC2707 跨期，可切 LC−LI 跨品种），1 分钟价差线 + 较首根变动 |
| 合约切换 | **点击任意卡片**即切换焦点合约（K 线 + 分时同步切换），也可用下拉框 |
| 秒级盘口（可选） | 部署 `workers/` 后填入 URL 即启用：秒级最新价 + 买一/卖一 + 盘口，失败自动降级 |

默认监控合约：`LC2705 / LC2707 / LC2709`（碳酸锂）、`LI2707 / LI2709`（氢氧化锂），均为广州期货交易所品种。

## 涨跌基准（自动降级链）

```
日K线结算价 s（较昨结）→ 日K线收盘价 c（较昨收）→ 上一交易日分钟收盘价（较昨收）→ 当日开盘价（较开盘）
```

> 碳酸锂(LC) 能取到**昨结算**（新浪日K线 `s` 字段）；**氢氧化锂(LI) 是新浪尚未收录日K 的新品种**，日K与连续合约均返回 `null`，分钟K线只覆盖当日，因此自动降级为**较开盘**，并在卡片上明确标注，不会静默丢失。
> 若启用秒级盘口（Cloudflare Workers），`hq.sinajs.cn` 能对 LI 返回昨结算价，基准会自动升级为"较昨结"。

## 部署到 GitHub Pages

1. 新建仓库，把本目录 push 上去：
   ```bash
   git init
   git add -A
   git commit -m "feat: lithium futures live board (LC/LI minute kline + realtime quote)"
   git branch -M main
   git remote add origin git@github.com:<你的用户名>/lithium-arbitrage.git
   git push -u origin main
   ```
2. `Settings → Pages → Build and deployment → Deploy from a branch → main / (root)`。
3. 几分钟后访问 `https://algo23-yunqingtian.github.io/lithium-arbitrage/`。

> ⚠️ GitHub Pages 在中国大陆访问可能较慢或不稳定。若主要在国内看盘，建议换国内静态托管或自建。

> 修改监控合约：编辑 `index.html` 顶部 `CONTRACTS` 数组（`code` 为大写合约代码，如 `LC2711`；`label`/`market` 为展示名）。

## 数据源与接口（实测 2026-11-26 可用）

新浪财经期货接口均为 JSONP（`var _=(...)`），**不校验 Referer、可跨域直连**，浏览器直接可用：

| 用途 | 接口 | 返回 | 实测容量 |
|---|---|---|---|
| 当日分时（实时报价来源） | `stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_=/InnerFuturesNewService.getMinLine?symbol=LC2705&type=1` | `[[时间,价格,均价,持仓,累计量,?,日期],…]`，**仅第一根带日期** | 当日全量点 |
| 分钟 K 线 | `…/InnerFuturesNewService.getFewMinLine?symbol=LC2705&type=1` | `[{d,o,h,l,c,v,p},…]`，`type=1/3/5/15/30/60` | **固定约 1000 根**：1分≈1个月、3分≈3周、15分≈3个月、60分≈半年 |
| 日 K 线 | `…/InnerFuturesNewService.getDailyKLine?symbol=LC2705` | `[{d,o,h,l,c,v,p,s},…]`，`s`=结算价 | LC 有全历史；**LI 返回 null** |

> **注意**：新浪另一接口 `hq.sinajs.cn`（秒级盘口五档）**强校验 Referer**（非新浪域名返回 403），纯前端跨域拿不到，故分钟级看板的"实时报价"采用当日分时最新点（分钟级精度）。如需秒级 tick，见下节。

## 本地预览 / 自检

```bash
python -m http.server 8000     # 预览 http://localhost:8000
node check_live.mjs           # 开发自检：mock 浏览器跑通「数据→渲染」全链路
node verify_real.mjs          # 真实接口 e2e：校验 5 个合约的分时/分钟K线/昨结算/卡片值
node check_worker.mjs         # Workers 代理单测：真实新浪行情样例验证解析+路由+CORS+token
```

## 秒级盘口（已实现，可选启用）

若需要**秒级 tick**，需要一层能带正确 Referer 的请求方（新浪秒级接口禁止浏览器直连）。**实现已就绪**，见 `workers/`：

| 方案 | 成本 | 精度 | 运维压力 |
|---|---|---|---|
| GitHub Actions 定时抓取 | 免费（每月 2000 分钟） | 最短 5 分钟（GitHub 调度下限） | 极低 |
| **Cloudflare Workers 代理（已实现）** | **免费额度 10 万次请求/天** | **秒级** | **几乎零（Serverless，无服务器）** |
| 自建 VPS 代理 | 海外 $3-5/月起 + 域名/HTTPS/防火墙 | 秒级 | 中等偏高 |

**启用只需两步**：

1. 部署 `workers/sina-quotes.worker.js` 到 Cloudflare Workers（`wrangler versions deploy`，约 3 分钟，详见 `workers/README.md`）
2. 把 Worker 地址填入 `index.html` 顶部 `WORKER_URL`（可选 `WORKER_TOKEN` 防刷）

- 启用后报价卡片显示**秒级盘口 + 买一/卖一**并带"秒级"标记，状态栏显示"秒级盘口(Workers)"
- **连续失败 3 次自动降级回分钟级**，不会白屏
- 额外收益：`hq.sinajs.cn` 对氢氧化锂(LI) 能返回昨结算价（新浪日K 对 LI 返回 `null`），启用后 LI 合约基准从"较开盘"升级为"较昨结"
- 容量核算：5 秒轮询 ≈ 2.88 万次/天，1 秒轮询 ≈ 8.64 万次/天，**均在免费额度内，无需自购服务器**

## 说明

- 刷新频率：实时报价/分时 5s，分钟K线/价差 30s，日K线抓取 60s 节流；秒级模式 1.5s。
- ECharts 加载顺序：npmmirror → bootcdn → staticfile → jsdelivr（逐级降级，避免国内 CDN 不通导致图表空白）。
- 价差按各周期收盘价对齐相减（跨期 = 同品种不同月，跨品种 = LC−LI）。
