# Samples a process tree (the root pid and every descendant) and prints one JSON object.
# Used by measure.js. Windows PowerShell 5.1 compatible; class names are not localized (unlike Get-Counter paths).
#   -Root <pid>     browser process of the app
#   -Private        also read the private working set (what Task Manager's Memory column shows); slower
param([Parameter(Mandatory = $true)][int]$Root, [switch]$Private)
$ErrorActionPreference = 'Stop'

$all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, WorkingSetSize, PrivatePageCount, KernelModeTime, UserModeTime, CommandLine
$t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$kids = @{}
foreach ($p in $all) {
  $pp = [int]$p.ParentProcessId
  if (-not $kids.ContainsKey($pp)) { $kids[$pp] = New-Object System.Collections.ArrayList }
  [void]$kids[$pp].Add($p)
}
$byId = @{}
foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
$tree = New-Object System.Collections.ArrayList
if ($byId.ContainsKey($Root)) {
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue($byId[$Root])
  while ($queue.Count) {
    $p = $queue.Dequeue()
    [void]$tree.Add($p)
    $id = [int]$p.ProcessId
    if ($kids.ContainsKey($id)) { foreach ($c in $kids[$id]) { if ([int]$c.ProcessId -ne $id) { $queue.Enqueue($c) } } }
  }
}
$pws = @{}
if ($Private -and $tree.Count) {
  $names = @($tree | ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.Name) } | Sort-Object -Unique)
  $filter = ($names | ForEach-Object { "Name like '" + $_.Replace("'", "''") + "%'" }) -join ' or '
  foreach ($c in (Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter $filter -Property IDProcess, WorkingSetPrivate)) {
    $pws[[int]$c.IDProcess] = [int64]$c.WorkingSetPrivate
  }
}
$out = foreach ($p in $tree) {
  $cl = [string]$p.CommandLine
  $type = 'browser'
  if ($cl -match '--type=([\w-]+)') { $type = $Matches[1] }
  $sub = ''
  if ($cl -match '--utility-sub-type=([\w.]+)') { $sub = $Matches[1] }
  $id = [int]$p.ProcessId
  [pscustomobject]@{
    pid = $id; ppid = [int]$p.ParentProcessId; name = $p.Name; type = $type; sub = $sub
    ws = [int64]$p.WorkingSetSize; priv = [int64]$p.PrivatePageCount
    pws = $(if ($pws.ContainsKey($id)) { $pws[$id] } else { $null })
    cpu100ns = [int64]$p.KernelModeTime + [int64]$p.UserModeTime
  }
}
[pscustomobject]@{ t = $t; procs = @($out) } | ConvertTo-Json -Depth 4 -Compress
