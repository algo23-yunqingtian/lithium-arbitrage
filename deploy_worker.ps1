<#
deploy_worker.ps1 — 秒级盘口 Cloudflare Workers 一键部署脚本（可执行）

用途：部署 workers/sina-quotes.worker.js 到 Cloudflare Workers，并把地址写回 index.html，
      让看板从「分钟级」升级为「秒级盘口」（买一/卖一 + 量仓 tick）。

鉴权（二选一，均不落盘、不进 commit）：
  A) Cloudflare API Token（推荐，无需浏览器，适合 agent 代跑）
     dash.cloudflare.com → My Profile → API Tokens → Create Token → 「Workers Scripts: Edit」
     拿到 token 后，在 DSH 会话临时设置（用后即弃，勿写文件）：
        $env:CLOUDFLARE_API_TOKEN = '<你的token>'
  B) 浏览器登录（需在本机浏览器完成 Cloudflare 授权）：
        npx --yes wrangler login

用法：
  pwsh deploy_worker.ps1                      # 仅部署（不写回 index.html）
  pwsh deploy_worker.ps1 -SetPage             # 部署 + 自动写回 index.html WORKER_URL
  pwsh deploy_worker.ps1 -SetPage -SetToken abc123   # 部署 + 给 worker 设 TOKEN 防刷 + 写回 WORKER_URL/WORKER_TOKEN

注意：
  - TOKEN 环境变量用于防刷（免费额度 10 万次/天），可选。设置后前端必须带 ?tk=<TOKEN>。
  - 脚本优先读环境变量：CLOUDFLARE_API_TOKEN（CF 鉴权）、WORKER_TOKEN（应用防刷 token）。
  - 所有凭据只走环境变量/参数，绝不写入文件。
#>
param(
  [string]$SetToken = '',   # 可选：设置 worker 的 TOKEN 环境变量（防刷）；也可用 $env:WORKER_TOKEN
  [switch]$SetPage          # 部署成功后自动更新 index.html 的 WORKER_URL / WORKER_TOKEN
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "== 秒级盘口 Workers 部署 ==" -ForegroundColor Cyan
Write-Host "目录: $PSScriptRoot"

# 0) 工具检查
try { $nv = node -v } catch { throw "未找到 node，请先安装 Node.js 18+" }
Write-Host "node: $nv"

# 1) 鉴权：优先 CLOUDFLARE_API_TOKEN，其次已登录
if ($env:CLOUDFLARE_API_TOKEN) {
  Write-Host "鉴权: 使用 CLOUDFLARE_API_TOKEN（环境变量，不落盘）" -ForegroundColor Green
} else {
  Write-Host "检测已有登录态..." -ForegroundColor Yellow
  $who = npx --yes wrangler whoami 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0 -and $who -match 'Logged in') {
    Write-Host "鉴权: 已登录 wrangler" -ForegroundColor Green
  } else {
    Write-Host @'
未检测到 Cloudflare 凭据。二选一（均不写文件）：

  A) 环境变量（推荐，无需浏览器）：在 DSH 会话先执行
        $env:CLOUDFLARE_API_TOKEN = '<你的 API Token>'
     再运行本脚本。

  B) 浏览器登录（需本机浏览器）：执行
        npx --yes wrangler login
     完成后重新运行本脚本。

Token 获取：dash.cloudflare.com → My Profile → API Tokens → Create Token → 「Workers Scripts: Edit」
'@ -ForegroundColor Yellow
    exit 2
  }
}

# 2) 部署 worker（npx 自动下载 wrangler，无需全局安装、不污染仓库）
Write-Host "部署 worker..." -ForegroundColor Yellow
$out = npx --yes wrangler versions deploy workers/sina-quotes.worker.js --name sina-quotes 2>&1 | Out-String
$out | ForEach-Object { Write-Host $_ }
$m = [regex]::Match($out, 'https://[a-z0-9-]+\.workers\.dev')
if (-not $m.Success) { throw "未能从部署输出解析出 workers.dev URL，请检查上方日志" }
$url = $m.Value
Write-Host "部署成功: $url" -ForegroundColor Green

# 3) 可选：设置 worker 的 TOKEN 环境变量（防刷）
$token = if ($SetToken) { $SetToken } else { $env:WORKER_TOKEN }
if ($token) {
  Write-Host "设置 worker TOKEN 环境变量（防刷）..." -ForegroundColor Yellow
  $token | npx --yes wrangler secret put TOKEN 2>&1 | ForEach-Object { Write-Host $_ }
}

# 4) 可选：写回 index.html WORKER_URL / WORKER_TOKEN
if ($SetPage) {
  $html = Get-Content index.html -Raw
  $before = $html
  $html = [regex]::Replace($html, "(const WORKER_URL\s*=\s*')[^']*(')", "`${1}$url`${2}")
  if ($token) { $html = [regex]::Replace($html, "(const WORKER_TOKEN\s*=\s*')[^']*(')", "`${1}$token`${2}") }
  if ($html -ne $before) {
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'index.html'), $html, [System.Text.UTF8Encoding]::new($false))
    Write-Host "已更新 index.html: WORKER_URL = $url" -ForegroundColor Green
    if ($token) { Write-Host "已更新 index.html: WORKER_TOKEN = <已设置>" -ForegroundColor Green }
    Write-Host "提示: 记得 git add index.html && git commit && git push 让线上生效" -ForegroundColor Yellow
  } else {
    Write-Host "index.html 未变化（可能已设置过 WORKER_URL）" -ForegroundColor Yellow
  }
}

# 5) 验证
try {
  $q = Invoke-WebRequest -Uri ($url + '?symbols=LC2705,LC2707,LI2707') -UseBasicParsing -TimeoutSec 20
  $head = $q.Content.Substring(0, [Math]::Min(80, $q.Content.Length))
  Write-Host "验证: HTTP $($q.StatusCode) | $head" -ForegroundColor Green
} catch {
  Write-Host "警告: 验证请求失败（$($_.Exception.Message)）—— worker 可能尚未就绪，稍后重试" -ForegroundColor Yellow
}

Write-Host "== 完成。页面接入后即启用秒级盘口（连续失败 3 次自动降级回分钟级） ==" -ForegroundColor Cyan
