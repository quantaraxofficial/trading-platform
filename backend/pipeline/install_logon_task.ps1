# Makes the live Vantage collector start by itself one minute after you sign in to Windows
# (a "TradePilot Live Collector" task in Task Scheduler, hidden window, log in
# %LOCALAPPDATA%\TradePilot\live_collector.log). Run once:
#
#   powershell -ExecutionPolicy Bypass -File backend\pipeline\install_logon_task.ps1
#
# Remove it again with:  Unregister-ScheduledTask -TaskName "TradePilot Live Collector"

$script = Join-Path $PSScriptRoot "start_live_collector.ps1"
$logDir = Join-Path $env:LOCALAPPDATA "TradePilot"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "live_collector.log"
$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -LogFile `"$log`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = "PT1M"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "TradePilot Live Collector" -Description "Streams Vantage XAUUSD ticks from MT5 to the TradePilot site" `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Installed. It starts at your next sign-in; to start it now: Start-ScheduledTask -TaskName 'TradePilot Live Collector'"
Write-Host "Log: $log"
