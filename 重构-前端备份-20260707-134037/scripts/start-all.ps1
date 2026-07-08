$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $RootDir
$FrontendDir = $RootDir
$BackendDir = Join-Path $RootDir 'backend'
$RuntimeDir = Join-Path $RootDir '.runtime'
$SetupScript = Join-Path $PSScriptRoot 'setup-linux.sh'
$FrontendGeneratedEnv = Join-Path $RootDir '.env.starmc.generated'
$FrontendModeGeneratedEnv = Join-Path $RootDir '.env.starmc.development.generated'
$BackendGeneratedEnv = Join-Path $BackendDir '.env.generated'

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Test-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      continue
    }

    $idx = $line.IndexOf('=')
    if ($idx -le 0) {
      continue
    }

    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    if ($key) {
      $values[$key] = $value
    }
  }

  return $values
}

function Get-RequiredEnvValue {
  param(
    [hashtable]$EnvMap,
    [string]$Key,
    [string]$FilePath
  )

  $value = $EnvMap[$Key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required key '$Key' not found in $FilePath. Run 'npm run config:doctor' at repository root and retry."
  }

  return $value
}

function Get-PortFromUrl {
  param(
    [string]$Url,
    [int]$DefaultPort
  )

  $uri = [Uri]$Url
  if ($uri.IsDefaultPort) {
    return $DefaultPort
  }
  return $uri.Port
}

function Assert-PortAvailable {
  param(
    [int]$Port,
    [string]$Name
  )

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "$Name port $Port is already in use. Update the simple config or stop the existing process, then rerun the script."
  }
}

function Write-StartupSummary {
  param(
    [string]$FrontendOrigin,
    [string]$BackendOrigin,
    [string]$PluginOrigin
  )

  Write-Host "Frontend: $FrontendOrigin"
  Write-Host "Backend:  $BackendOrigin"
  Write-Host "Plugin:   $PluginOrigin"
  Write-Host "Config:   generated via npm run config:doctor"
  Write-Host "Runtime:  $RuntimeDir"
}

if (-not (Test-Command 'node')) { throw 'Missing required command: node' }
if (-not (Test-Command 'npm')) { throw 'Missing required command: npm' }

Write-Host 'Refreshing generated configuration from repository root...'
Push-Location $RepoRoot
npm run config:doctor:simple
Pop-Location

if (-not (Test-Path (Join-Path $FrontendDir 'node_modules')) -or -not (Test-Path (Join-Path $BackendDir 'node_modules'))) {
  if (Test-Path $SetupScript) {
    bash $SetupScript
  } else {
    Write-Host 'Installing frontend dependencies...'
    npm install
    Write-Host 'Installing backend dependencies...'
    Push-Location $BackendDir
    npm install
    Pop-Location
  }
}

$frontendEnv = @{}
foreach ($filePath in @($FrontendGeneratedEnv, $FrontendModeGeneratedEnv)) {
  foreach ($entry in (Read-EnvFile -Path $filePath).GetEnumerator()) {
    $frontendEnv[$entry.Key] = $entry.Value
  }
}
$backendEnv = Read-EnvFile -Path $BackendGeneratedEnv

$FrontendOrigin = Get-RequiredEnvValue -EnvMap $frontendEnv -Key 'VITE_PUBLIC_SITE_ORIGIN' -FilePath $FrontendGeneratedEnv
$BackendOrigin = Get-RequiredEnvValue -EnvMap $backendEnv -Key 'PUBLIC_API_BASE_URL' -FilePath $BackendGeneratedEnv
$PluginTarget = Get-RequiredEnvValue -EnvMap $frontendEnv -Key 'VITE_LOCAL_PLUGIN_TARGET' -FilePath $FrontendModeGeneratedEnv
$FrontendPort = Get-PortFromUrl -Url $FrontendOrigin -DefaultPort 5173
$BackendPort = [int](Get-RequiredEnvValue -EnvMap $backendEnv -Key 'PORT' -FilePath $BackendGeneratedEnv)
$PluginPort = [int](Get-RequiredEnvValue -EnvMap $backendEnv -Key 'PLUGIN_PORT' -FilePath $BackendGeneratedEnv)

Assert-PortAvailable -Port $FrontendPort -Name 'Frontend'
Assert-PortAvailable -Port $BackendPort -Name 'Backend'

Write-Host "Starting backend using generated config on port $BackendPort..."
$backendCommand = 'npm run dev:simple'
$backendProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $backendCommand) -WorkingDirectory $BackendDir -PassThru -NoNewWindow

Write-Host "Starting frontend using generated config at $FrontendOrigin..."
$frontendCommand = "npm run dev -- --host 0.0.0.0 --port $FrontendPort"
$frontendProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $frontendCommand) -WorkingDirectory $FrontendDir -PassThru -NoNewWindow

Write-StartupSummary -FrontendOrigin $FrontendOrigin -BackendOrigin $BackendOrigin -PluginOrigin $PluginTarget
Write-Host "Frontend PID: $($frontendProcess.Id)"
Write-Host "Backend PID: $($backendProcess.Id)"
Write-Host "Backend configured plugin port: $PluginPort"

Wait-Process -Id $frontendProcess.Id, $backendProcess.Id
