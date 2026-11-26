# lithium-arbitrage · 工作群交接文档

> 本文档面向**所有 agent**：本项目的位置、能力、验证方式、上线状态、凭证安全约定全部在此。
> 维护者：DeepSeek Harness / SenseNova agent（2026-11-26 建立）
> 最近更新：2026-11-26

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
- [x] 本地 git 仓库已初始化并提交（`f0e349f`，8 文件 / 1139 行）
- [x] 远端已配置为 SSH
- [ ] **GitHub 上的 `lithium-arbitrage` 空仓库尚未创建** → 无法 push
- [ ] 建仓后需开启 GitHub Pages（`Settings → Pages → Deploy from branch → main / (root)`）

**建仓链接（点一下即可，表单已预填）**：
`https://github.com/new?name=lithium-arbitrage`
→ 创建者 `algo23-yunqingtian`，Public，**不要**初始化 README/License（本地已有完整内容，否则 push 冲突）。

建仓完成后，其他 agent 可直接执行：
```powershell
git -C 'D:\DSH_WORK\github工作\lithium-arbitrage' push -u origin main
```

## 4. 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 主看板（单文件，纯静态） |
| `README.md` | 用户文档（数据源/部署/接口/验证） |
| `workers/sina-quotes.worker.js` | Cloudflare Workers 秒级盘口代理（可选模块） |
| `workers/README.md` | Workers 部署说明 |
| `check_live.mjs` | 自检①：mock 浏览器跑通「数据→渲染」全链路 |
| `verify_real.mjs` | 自检②：真实接口 e2e，校验 5 合约真实数据 |
| `check_worker.mjs` | 自检③：Workers 代理单测（真实新浪行情样例） |
| `.gitignore` | 忽略 OS/日志/依赖/**密钥** |

## 5. 默认监控合约

`LC2705 / LC2707 / LC2709`（碳酸锂）、`LI2707 / LI2709`（氢氧化锂）——均为广州期货交易所品种。
改合约只需编辑 `index.html` 顶部 `CONTRACTS` 数组（`code` 大写，如 `LC2711`）。

## 6. 数据源与关键坑（实测 2026-11-26）

**新浪两套接口，访问条件不同**：

| 接口 | 内容 | 浏览器直连 | 说明 |
|---|---|---|---|
| `stock2.finance.sina.com.cn` JSONP | 分时 / 分钟K线 / 日K线 | ✅ 不校验 Referer | 本项目主力，代码必须**大写** |
| `hq.sinajs.cn` | **秒级盘口五档** | ❌ 非新浪域名 **403** | 强校验 `Referer: https://finance.sina.com.cn` |

**分钟K线容量**（`getFewMinLine`，固定约 1000 根）：1分≈1个月、3分≈3周、15分≈3个月、60分≈半年。

**两个必知坑**：
1. **分时数组只有第一根带日期**（`rows[0][6]`），取最后一根的日期会得到 `undefined`。
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

1. **推送凭证**：本机 `~/.ssh/id_ed25519_agent`（已验证对 `algo23-yunqingtian` 账号有效，`git ls-remote` 可取到 commit）。所有 agent 直接用 SSH 推送即可，**不需要、也不应索要 token**。
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
node check_worker.mjs   # Workers 代理
```

三套全绿才允许 push。

## 10. 已知限制

- **GitHub Pages 在中国大陆访问常慢/不稳**：图表空白的头号怀疑对象是 ECharts CDN。页面已做多级降级（npmmirror → bootcdn → staticfile → jsdelivr），若仍空白，改用国内静态托管。
- 报价精度：分钟级模式取当日分时最新点（分钟级），秒级模式才是 tick 级。
- 非交易时段接口正常返回，但数据是上一交易日/上一时段，卡片会显示 `undefined`→ 已用 `todayStr()` 兜底。
