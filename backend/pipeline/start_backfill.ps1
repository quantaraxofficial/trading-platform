# Backfills Vantage history for several symbols into the server's ClickHouse (pipeline/backfill.py),
# one symbol after another, newest day first. Needs the MT5 terminal running and logged in.
#
# The ClickHouse password is read from the server over SSH each time and kept only in this
# process's environment (never written to a file). ClickHouse listens on the server's loopback
# only, so it's reached through an SSH tunnel opened here and closed at the end. Runs at below-
# normal priority so the PC stays responsive. Re-running resumes: days already stored are skipped.
#
#   powershell -ExecutionPolicy Bypass -File backend\pipeline\start_backfill.ps1
#   powershell -ExecutionPolicy Bypass -File backend\pipeline\start_backfill.ps1 -Symbols EURUSD,GBPUSD

param(
  [string[]]$Symbols = @("EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
                         "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "USDINR", "USDMXN", "EURAUD"),
  [string]$Server = "deploy@34.93.138.162",
  [string]$Key = "$HOME\.ssh\tradepilot_gcp",
  [int]$Login = 26344911,
  [int]$LocalPort = 18123,
  # (set in deploy/prod/docker-compose.yml, not in .env)
  [string]$ClickHouseUser = "tradepilot"
)

[System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = "BelowNormal"

# The ClickHouse login from the server's deploy settings (into this process only)
$envLines = ssh -i $Key -o BatchMode=yes -o ConnectTimeout=15 $Server "grep -E '^CLICKHOUSE_(USER|PASSWORD|DATABASE)=' /opt/tradepilot/deploy/prod/.env"
foreach ($line in $envLines) {
  $i = $line.IndexOf("=")
  if ($i -gt 0) { [Environment]::SetEnvironmentVariable($line.Substring(0, $i), $line.Substring($i + 1).Trim(), "Process") }
}
if (-not $env:CLICKHOUSE_PASSWORD) { Write-Host "Could not read the ClickHouse login from $Server"; exit 1 }
if (-not $env:CLICKHOUSE_USER) { $env:CLICKHOUSE_USER = $ClickHouseUser }
$env:CLICKHOUSE_HOST = "127.0.0.1"
$env:CLICKHOUSE_PORT = "$LocalPort"

# The tunnel to the server's ClickHouse (127.0.0.1:8123 there)
$tunnel = Start-Process ssh -ArgumentList @("-i", $Key, "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=30",
  "-N", "-L", "${LocalPort}:127.0.0.1:8123", $Server) -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 4
if ($tunnel.HasExited) { Write-Host "The SSH tunnel didn't open"; exit 1 }

Set-Location (Join-Path $PSScriptRoot "..")
try {
  foreach ($sym in $Symbols) {
    Write-Host "===== $sym ====="
    python -m pipeline.backfill --symbol $sym --login $Login
    Write-Host "===== $sym finished (exit $LASTEXITCODE) ====="
  }
} finally {
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
}
