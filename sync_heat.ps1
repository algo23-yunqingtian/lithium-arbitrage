# sync_heat.ps1 — 每日「热度数据」一键同步：读 SMM 情绪因子 xlsx -> data/heat.json -> git 提交推送
# 用法：  pwsh sync_heat.ps1            (入库 + 提交 + 推送)
#         pwsh sync_heat.ps1 -NoPush    (只入库 + 提交，不推送)
# 前置：  本机已 pip install openpyxl；仓库已配置好 git 远程(SSH) 凭据
param([switch]$NoPush)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

Write-Host '[1/3] 读取 SMM 情绪因子并合并写入 data/heat.json ...' -ForegroundColor Cyan
python sync_heat.py
if ($LASTEXITCODE -ne 0) { Write-Host '!! 同步失败（检查 python/openpyxl/源文件）' -ForegroundColor Red; exit 1 }

git add data/heat.json
$changed = git status --porcelain data/heat.json
if ($changed) {
  Write-Host '[2/3] 有变更，git 提交 ...' -ForegroundColor Cyan
  $msg = 'heat: 每日热度数据更新 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  git commit -m $msg
  if ($LASTEXITCODE -ne 0) { Write-Host '!! 提交失败' -ForegroundColor Red; exit 1 }
} else {
  Write-Host '[2/3] 无变更（可能当天数据未刷/重复），跳过提交' -ForegroundColor Yellow
}

if ($NoPush) { Write-Host '[-NoPush] 已跳过推送。' -ForegroundColor Yellow; exit 0 }
Write-Host '[3/3] git 推送 ...' -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) { Write-Host '!! 推送失败（网络/凭据/远端锁定），数据已在本地 data/heat.json' -ForegroundColor Red; exit 1 }
Write-Host '完成：热度数据已同步到 GitHub（Pages 约1分钟生效）。' -ForegroundColor Green
