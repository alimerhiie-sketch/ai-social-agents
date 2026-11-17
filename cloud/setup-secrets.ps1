# Agent HQ — one-time secret setup for the cloud version.
# Run it yourself in PowerShell:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\alime\Documents\ai-social-agents-cloud\cloud\setup-secrets.ps1"
#
# What it does (nothing is printed on screen, nothing leaves your own Cloudflare / GitHub accounts):
#   1. A random internal password the Worker and the GitHub runner share (HQ_SECRET)
#   2. Your GitHub login token -> the Worker, so it can start the runner when work is queued (GITHUB_TOKEN)
#      Note: this is the same token the `gh` command uses on this PC (access to your repos + workflows).
#   3. Your Cloudflare Workers AI key from .env.local -> GitHub, so the runner can paint (CLOUDFLARE_*)
#   4. The dashboard address -> GitHub (HQ_URL)
#   5. A dashboard password YOU choose (DASHBOARD_PASSWORD) — you'll log in with it on laptop and phone
#   6. A long-lived Claude token -> GitHub, so the agents run on your subscription (CLAUDE_CODE_OAUTH_TOKEN)

$ErrorActionPreference = "Stop"
$repo = "alimerhiie-sketch/ai-social-agents"
$worker = "C:\Users\alime\Documents\ai-social-agents-cloud"
$envFile = "C:\Users\alime\Documents\ai-social-agents\.env.local"
Set-Location $worker

function Read-EnvValue($name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { throw "$name not found in $envFile" }
  return $line.Substring($name.Length + 1).Trim()
}

Write-Host "`n[1/6] Internal secret" -ForegroundColor Cyan
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$hqSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })

Write-Host "[2/6] GitHub token for the Worker" -ForegroundColor Cyan
$ghToken = (gh auth token).Trim()

Write-Host "[5/6] Choose the dashboard password (typing is hidden)" -ForegroundColor Cyan
$pw1 = Read-Host -AsSecureString "Dashboard password"
$pw2 = Read-Host -AsSecureString "Type it again"
$plain = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
$p1 = & $plain $pw1; $p2 = & $plain $pw2
if ($p1 -ne $p2) { throw "The two passwords don't match. Run the script again." }
if ($p1.Length -lt 10) { throw "Use at least 10 characters (the dashboard is on the internet)." }

# Worker secrets in one go, via a temporary file that is deleted right after.
$tmp = Join-Path $env:TEMP ("hq-secrets-" + [guid]::NewGuid() + ".json")
@{ HQ_SECRET = $hqSecret; GITHUB_TOKEN = $ghToken; DASHBOARD_PASSWORD = $p1 } | ConvertTo-Json | Set-Content -Path $tmp -Encoding utf8
try { npx wrangler secret bulk $tmp } finally { Remove-Item $tmp -Force }

Write-Host "`n[1/6 + 3/6 + 4/6] GitHub secrets for the runner" -ForegroundColor Cyan
gh secret set HQ_SECRET -R $repo --body $hqSecret
gh secret set CLOUDFLARE_ACCOUNT_ID -R $repo --body (Read-EnvValue "CLOUDFLARE_ACCOUNT_ID")
gh secret set CLOUDFLARE_API_TOKEN -R $repo --body (Read-EnvValue "CLOUDFLARE_API_TOKEN")
gh secret set HQ_URL -R $repo --body "https://agent-hq.ai-social-agents.workers.dev"
$hqSecret = $null; $ghToken = $null; $p1 = $null; $p2 = $null

Write-Host "`n[6/6] Claude token" -ForegroundColor Cyan
Write-Host "A browser opens: approve, then COPY the long token (sk-ant-oat...) this window prints."
claude setup-token
Write-Host "`nPASTE the token below and press Enter (it stays hidden):" -ForegroundColor Yellow
gh secret set CLAUDE_CODE_OAUTH_TOKEN -R $repo

Write-Host "`nDone. GitHub secrets now:" -ForegroundColor Green
gh secret list -R $repo
Write-Host "`nOpen https://agent-hq.ai-social-agents.workers.dev and log in with your new password."
