# lithium-arbitrage · 工作群交接文档

> 本文档面向**所有 agent**：本项目的位置、能力、验证方式、上线状态、凭证安全约定全部在此。
> 维护者：DeepSeek Harness / SenseNova agent（2026-11-26 建立）
> 最近更新：2026-11-26（P1+P2 上线，`0214c15`）

---

## 1. 一句话

**锂期货实时看板**——碳酸锂(LC) / 氢氧化锂(LI) 的分钟级 K 线、当日分时、实时报价卡片、跨期/跨品种价差。纯静态单页，零后端，GitHub Pages 托管。

## 2. 关键位置

| 项 | 值 |
|---|---|
| 本地项目目录 | `D:\DSH_WORK\github工作\lithium-arbitrage` |
| GitHub 仓库（待建） | `https://github.com/algo23-yunqingtian/lithium-arbitrage` |
| Pages 地址（建仓+开启后生效） | `https://algo23-yunqingtian.github.io/lithium-arbitrage/` |
| 远端协议 | **SSH** `git@github.com:algo23-yunqingtian/lithium-arbitrage.git` |
| GitHub 账号 | `algo23-yunqingtian` |
| 本地分支 / 首次提交 | `main` / `f0e349f` |

## 3. 当前状态（⚠️ 先看这里）

- [x] 页面开发完成，三套验证全绿
- [x] 本地 git 仓库已初始化并提交（`88b9659`，2 commits）
- [x] 远端已配置为 SSH
- [x] **已推送 GitHub**：`main = 1615424`（`github.com:algo23-yunqingtian/lithium-arbitrage.git`）
- [x] **GitHub Pages 已开启并上线**：`https://algo23-yunqingtian.github.io/lithium-arbitrage/`（HTTP 200，2026-11-26 实测验证，标题/合约/配置均正确）
- [x] **V2 增强已上线**（`1615424`，2026-11-26）：K线显示增强 + LC↔LI 加工套利 + 每日快照长期存储
- [x] **P0 增强已上线**（`60e1a10`，2026-11-26）：跟随主力合约 + 机会徽标高亮 + LC/LI 量仓显示
- [x] **P1+P2 已上线**（`0214c15`，2026-11-26）：修复量仓字段错位 + 套利价差历史时序图 + 日内快照 + 合约扩至 7 + 新浪多源降级 + ECharts 第5 CDN

**后续推送（其他 agent）**：
```powershell
git -C 'D:\DSH_WORK\github工作\lithium-arbitrage' push
# 本仓库已配置 core.sshCommand 自动使用账号级 SSH key（~/.ssh/id_ed25519_github），直接 push 即可
```

**Pages 配置**：`Settings → Pages → Deploy from a branch → main / (root)`（已完成）。线上地址 `https://algo23-yunqingtian.github.io/lithium-arbitrage/`。

## 4. 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 主看板（单文件，纯静态） |
| `README.md` | 用户文档（数据源/部署/接口/验证） |
| `workers/sina-quotes.worker.js` | Cloudflare Workers 秒级盘口代理（可选模块） |
| `workers/README.md` | Workers 部署说明 |
| `check_live.mjs` | 自检①：mock 浏览器跑通「数据→渲染」全链路 |
| `verify_real.mjs` | 自检②：真实接口 e2e，校验 7 合约真实数据 |
| `check_arb.mjs` | 自检③：加工套利实时自检（找最活跃对 + 算两向套利空间） |
| `snapshot_daily.mjs` | 快照脚本：抓 7 合约 → 写 `data/history.json`（长期存档）+ `data/intraday.json`（日内快照） |
| `data/history.json` | 长期云数据库：每日收盘快照，逐日累积，可回溯任意一天 |
| `data/intraday.json` | 日内快照：盘中多次记录套利价差，滚动保留最近 240 点 |
| `.github/workflows/daily-snapshot.yml` | GitHub Actions：工作日盘中 4 次（11:00/13:30/14:30/15:30 北京）抓取并 push |
| `.gitignore` | 忽略 OS/日志/依赖/**密钥** |

## 5. 默认监控合约

`LC2705 / LC2707 / LC2709 / LC2711`（碳酸锂）、`LI2707 / LI2709 / LI2711`（氢氧化锂）——均为广州期货交易所品种。
改合约只需编辑 `index.html` 顶部 `CONTRACTS` 数组（`code` 大写，如 `LC2711`）。

## 6. 数据源与关键坑（实测 2026-11-26）

**新浪两套接口，访问条件不同**：

| 接口 | 内容 | 浏览器直连 | 说明 |
|---|---|---|---|
| `stock2.finance.sina.com.cn` JSONP | 分时 / 分钟K线 / 日K线 | ✅ 不校验 Referer | 本项目主力，代码必须**大写** |
| `hq.sinajs.cn` | **秒级盘口五档** | ❌ 非新浪域名 **403** | 强校验 `Referer: https://finance.sina.com.cn` |

**分钟K线容量**（`getFewMinLine`，固定约 1000 根）：1分≈1个月、3分≈3周、15分≈3个月、60分≈半年。

**两个必知坑**：
1. **分时 getMinLine 行结构**（实测 2026-11-26）：`[time, price, avg, 分钟成交量, 持仓量]`，共 5 字段，**无日期字段**（页面用 `todayStr()` 兜底）。⚠️ 注意：`idx3 = 该分钟成交量`（全部分钟求和 = 当日成交量），`idx4 = 持仓量`。此前曾按"idx3=持仓/idx4=量"实现，导致量仓显示反了，`0214c15` 已修复（卡片/套利面板/快照均改为"成交量=各分钟求和、持仓=idx4"）。
2. **氢氧化锂(LI) 新浪未收录日K**：`getDailyKLine?symbol=LI2707` 和 `LI0` 都返回 `var _=(null)`，分钟K线只覆盖当日 → **昨结算取不到**。页面已实现基准自动降级链并在卡片标注，不要"修"它：
   ```
   日K结算价 s（较昨结）→ 日K收盘价 c（较昨收）→ 上交易日分钟收盘（较昨收）→ 当日开盘（较开盘）
   ```
   秒级盘口模式启用后，`hq.sinajs.cn` 能返回 LI 的昨结算价，基准会自动升级为"较昨结"。

**别踩的坑**：不要在严格模式 JS 里 `delete window._` —— 新浪 JSONP 用 `var _=(...)` 声明全局，该属性不可删除，会抛 `TypeError` 导致整条数据链路静默挂死（页面全空白且不报错）。

## 7. 秒级盘口（可选，已实现）

- `WORKER_URL` 留空 = 纯分钟级；填入 Workers 地址 = 秒级（卡片出现"秒级"标记 + 买一/卖一）
- **连续失败 3 次自动降级**回分钟级
- 免费额度：Cloudflare Workers 10 万次请求/天；1.5s 轮询 ≈ 9.6 万次/天，5s ≈ 2.88 万次/天，均在额度内
- 部署：`wrangler versions deploy workers/sina-quotes.worker.js --name sina-quotes`

## 8. 凭证与权限安全约定（⚠️ 所有 agent 必读）

**本项目凭证一律走 SSH，不落任何明文 token。**

1. **推送凭证**：账号级 SSH key `~/.ssh/id_ed25519_github`（已加入 GitHub 账号 SSH keys）。本仓库已配置 `core.sshCommand` 指向 `~/.ssh/lithium_ssh_config`（专用于 github.com，仅用这把 key），其他 agent 直接 `git push` 即可，**不需要、也不应索要 token**。
   ⚠️ `~/.ssh/id_ed25519_agent` 是 framework-tree 的**部署密钥**（deploy key），只能访问 framework-tree，**勿**用于新仓库。
2. **禁止行为**：不要把 PAT / API token / 密码 / cookie 写入任何文件（包括本文档、README、脚本、日志）。仓库 `.gitignore` 已含 `*.env` / `.env*` / `*.pem` / `*.key` / `secrets/` 兜底。
3. **若确需 token 才能完成某操作**（例如调 GitHub REST API 开 Pages）：
   - 让用户在**本地终端**里临时导出为环境变量（`$env:GH_TOKEN=...`），**用后即弃**
   - **不要**写入文件、不要写进 commit、不要写进本文档
   - 用完立刻 `Remove-Item Env:\GH_TOKEN`
4. **Pages 设置**目前只有网页方式（`Settings → Pages`），无 token 时由用户点一次。

## 9. 验证方式（任何改动后必跑）

```powershell
cd D:\DSH_WORK\github工作\lithium-arbitrage
node check_live.mjs     # 渲染链路
node verify_real.mjs    # 真实接口（需网络，交易时段数据更完整）
node check_arb.mjs      # 加工套利自检
node snapshot_daily.mjs # 手动抓一次快照（覆盖/追加今天，写入两个 data/*.json）
```

三套全绿才允许 push。

## 10. 已知限制

- **GitHub Pages 在中国大陆访问常慢/不稳**：图表空白的头号怀疑对象是 ECharts CDN。页面已做多级降级（npmmirror → bootcdn → staticfile → jsdelivr），若仍空白，改用国内静态托管。
- 报价精度：分钟级模式取当日分时最新点（分钟级），秒级模式才是 tick 级。
- 非交易时段接口正常返回，但数据是上一交易日/上一时段，卡片会显示 `undefined`→ 已用 `todayStr()` 兜底。

## 11. V2 增强（2026-11-26，commit `1615424`）

### 11.1 K线显示增强
- 默认显示**最近 320 根**（不足则全显），底部新增**缩放滑块**，可拉到全量（LC 1分≈1023 根）。
- 新增**成交量 + 持仓双副图**：分钟K线对象自带 `.v`（成交量）和 `.p`（持仓），随实时刷新。
- ⚠️ **氢氧化锂(LI) 期货 2026-11-26 新上市**，新浪仅有当日数据（1分≈225 根、60分≈4 根）。你看到"四五根K线"不是 bug，是 LI 历史只有今天。LC 历史充足（1分 1023 根、日K 128 根）。

### 11.2 LC ↔ LI 加工套利（a/b 变量）
- 公式（加工费按 元/吨氢氧化锂 报价）：
  - **LC→LI（碳转氢）**：1吨LC + 加工 → `MW_LH/MW_LC`(=42/37≈1.135) 吨LI；每吨LC加工成本 = `COST_LC2LH × ratio`；套利利润 = `ratio×LI价 − LC价 − COST_LC2LH×ratio`；保本LI价 = `(LC价 + COST_LC2LH×ratio)/ratio`。
  - **LI→LC（氢转碳）**：1吨LI + 加工 → `1/ratio`(=0.881) 吨LC；套利利润 = `LC价/ratio − LI价 − COST_LH2LC`；保本LC价 = `(LI价 + COST_LH2LC)×ratio`。
- 参数在 `index.html` 顶部 `ARB` 对象（`MW_LH=42, MW_LC=37, COST_LC2LH=5000, COST_LH2LC=7000`），**页面输入框可直接改**，全部计算即时联动。改代码后请同步 `snapshot_daily.mjs` 里的 `ARB`。
- 数值交叉验证通过：两个方向保本价回代后套利空间 = 0.000。
- **P0 增强（`60e1a10`）**：`跟随主力`开关（默认开，自动锁定当日最活跃 LC/LI 合约，手动改合约自动关闭）；两个方向带 `✅有机会/无利` 徽标（利润>0 绿色高亮）；套利卡片显示 LC/LI 量仓（提醒流动性）。
- 套利自检：`node check_arb.mjs`（实时拉价，算两向套利空间 + 找最活跃合约对）。

### 11.3 每日快照长期存储（GitHub 即云数据库）
- **存储位置**：`data/history.json`（本仓库），由 **GitHub Actions**（`.github/workflows/daily-snapshot.yml`）每个工作日 15:30（北京）抓取 5 合约日K/分时最新 + 加工套利，追加当天记录并 push。
- **为什么是 GitHub**：免费、云端、带版本历史（每天一个 commit 即恢复点）、无需 token（用 GITHUB_TOKEN）、可公开查看。一年后可 `git log` / 网页回溯任意一天的价格。
- 页面「日K」标签会自动合并 `data/history.json` 历史 + 新浪实时日K，随快照逐日累积，LI 的日K会自动补全。
- ⚠️ ~~前提：仓库 `Settings → Actions → General → Workflow permissions` 需为 Read and write~~ —— **实际不需要**：`.github/workflows/daily-snapshot.yml` 顶部已显式声明 `permissions: contents: write`，GitHub 文档明确规定 **workflow 内声明的权限覆盖仓库级默认设置**，GITHUB_TOKEN 已获写权限，push 必然成功。无需手工改设置（本机无 `gh` CLI 也无 token，且确实不必要）。
- **日内粒度**：同 workflow 工作日盘中 4 次（11:00/13:30/14:30/15:30 北京）额外抓取，写入 `data/intraday.json`（滚动保留 240 点 ≈ 60 交易日），页面「套利价差历史」图以虚线显示。
- **合约扩至 7**（含 LC2711 / LI2711）：`snapshot_daily.mjs` 的 `CONTRACTS` 与 `index.html` 保持一致；`history.json` 加载后强制同步 `contracts` 元数据。
- 本地手动跑一次：`node snapshot_daily.mjs`（覆盖/追加今天）。

---

## 12. P1 + P2 增强（2026-11-26，commit `0214c15`）

### 12.1 修复：量仓字段错位（重要）
- **getMinLine 行 = `[time, price, avg, 分钟成交量, 持仓量]`**（idx3=该分钟量，全分钟求和=日成交量；idx4=持仓量）。
- 此前 P0 误按"idx3=持仓、idx4=量"实现，导致卡片/套利面板**成交量显示成了持仓（24.5万）、持仓显示成了 2**。已修复为正确映射，涉及 `index.html`（`renderCards` / `lastVolPos`）、`snapshot_daily.mjs`（`liveVol`/`livePos`）、`verify_real.mjs`、`check_arb.mjs`。

### 12.2 P1：套利价差历史时序图
- 套利面板下方新增「套利价差历史」图：**实线=日度快照**（`history.json` 每日收盘两向套利空间）、**虚线=日内快照**（`intraday.json` 盘中点），时间轴混合展示，含零线（上方>0 为机会）。
- 数据源：`data/history.json`（日度）+ `data/intraday.json`（日内），页面启动时 `fetch` 同源加载，缺失则显示提示、不影响实时。

### 12.3 P1：日内快照粒度
- `snapshot_daily.mjs` 每次运行追加一个紧凑点到 `data/intraday.json`（`{date,time,lc,lh,lc2lh_profit,lh2lc_profit,ts}`），滚动保留 240 点（≈60 交易日）。
- workflow 工作日盘中 4 次：**11:00 / 13:30 / 14:30 / 15:30 北京**（UTC 03:00 / 05:30 / 06:30 / 07:30），15:30 那次即收盘日度存档；已加 `concurrency` 防重叠。

### 12.4 P2：合约扩充 + 多源降级 + CDN
- **合约 5→7**：新增 `LC2711`、`LI2711`（LI 全曲线 2707/2709/2711；LC 前四 2705/2707/2709/2711）。三处同步：`index.html` CONTRACTS、`snapshot_daily.mjs` CONTRACTS、`history.json` contracts 元数据。
- **新浪多源降级**：`SINA_HOSTS = [stock2, stock]`，主源 `jsonp` 失败自动切备用源重试一次（`jsonpHost`）。备用 host `stock.finance.sina.com.cn` 实测可用。
- **ECharts 第 5 CDN**：新增 `unpkg.com/echarts@5`（npmmirror → bootcdn → staticfile → jsdelivr → unpkg）。

### 12.5 权限确认结论（回应"帮我代劳确认 Actions 权限"）
- **无需修改仓库设置**：workflow 已显式 `permissions: contents: write`，GitHub 文档规定 workflow 内声明**覆盖**仓库级默认（Read only）设置，GITHUB_TOKEN 已获写权限，每日快照 push 必然成功。
- 本机无 `gh` CLI、无 PAT，无法调 REST API 改仓库设置；且**确实不必要**。首个真实 cron 验证：**2026-11-27（明天）15:30 北京**，届时 `history.json` 应新增 2026-11-27 一条。

### 12.6 未做 / 需外部凭据（已备好可执行脚本）
- **秒级盘口（Workers）**：已写好**可执行脚本 `deploy_worker.ps1`**（一键：鉴权→部署→写回 `index.html` WORKER_URL→验证）。本机无 Cloudflare 凭据，无法实际部署，但你只需提供 Cloudflare API Token（`dash.cloudflare.com → My Profile → API Tokens → Create Token → 「Workers Scripts: Edit」`），在会话里临时 `$env:CLOUDFLARE_API_TOKEN='<token>'`（用后即弃，不落盘），再 `pwsh deploy_worker.ps1 -SetPage` 即一键启用秒级。已验证：npx 可拉 wrangler 4.168.0、部署命令参数校验通过（唯一报错=缺 token）、无凭据时脚本给出清晰指引并 exit 2。
- **腾讯 ifzq 备用源**：实测 `Can't load controller:FuturesController`，端点不可用，未纳入降级链（新浪双 host 已够）。
