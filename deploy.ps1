param(
    [string]$Message = "Auto-update and Zero-Downtime deploy for bot.bird-ads.com"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/3] Adding changes to Git..." -ForegroundColor Cyan
git add -A

$status = git status --porcelain
if ($status) {
    git commit -m "$Message"
    Write-Host "[2/3] Pushing changes to GitHub..." -ForegroundColor Cyan
    git push origin main
} else {
    Write-Host "[Info] No local changes to commit, proceeding to server sync..." -ForegroundColor Yellow
}

Write-Host "[3/3] Triggering Zero-Downtime Deployment on Server (whatsapp-bot)..." -ForegroundColor Cyan
ssh my-cyberpanel "bash /home/bird-ads.com/bot.bird-ads.com/deploy.sh"

Write-Host "[Done] Deployment finished successfully without downtime!" -ForegroundColor Green
