# Starts the live Vantage collector (pipeline/live_collector.py) on this PC.
# The ingest token is read from the server over SSH each time and kept only in this process's
# environment: it is never written to a file. Needs the MT5 terminal running and logged in.
#
#   powershell -ExecutionPolicy Bypass -File backend\pipeline\start_live_collector.ps1

param(
  [string]$Server = "deploy@34.93.138.162",
  [string]$Key = "$HOME\.ssh\tradepilot_gcp",
  [string]$Site = "https://34-93-138-162.sslip.io",
  [int]$Login = 26344911,
  [string]$Symbol = "XAUUSD",
  [string]$LogFile = ""
)

# Started at sign-in the network may not be up yet: keep asking until the server answers
while ($true) {
  $token = ssh -i $Key -o BatchMode=yes -o ConnectTimeout=15 $Server "grep '^LIVE_INGEST_TOKEN=' /opt/tradepilot/deploy/prod/.env | cut -d= -f2-"
  if ($token -and $token.Trim().Length -ge 32) { break }
  Write-Host "Could not read the ingest token from $Server; trying again in 30 s"
  Start-Sleep -Seconds 30
}
$env:LIVE_INGEST_TOKEN = $token.Trim()

Set-Location (Join-Path $PSScriptRoot "..")
# Restart after a crash or a dropped connection, a few seconds later. With -LogFile (the logon
# task) the output goes there, the last ~5 MB kept
while ($true) {
  if ($LogFile) {
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 5MB) { Move-Item $LogFile "$LogFile.old" -Force }
    python -m pipeline.live_collector --login $Login --symbol $Symbol --url $Site *>> $LogFile
  } else {
    python -m pipeline.live_collector --login $Login --symbol $Symbol --url $Site
  }
  Write-Host "Collector stopped (exit $LASTEXITCODE); restarting in 10 s. Ctrl+C to quit."
  Start-Sleep -Seconds 10
}
