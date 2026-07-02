#Requires -Version 5.1
# Run while Velocity is up and HTTP API is listening (see plugins/starvelocity/config.yml http-api).
param(
    [string] $BaseUrl,
    [string] $ApiKey
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location -LiteralPath $root
$failed = 0

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
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

        $name = $line.Substring(0, $idx).Trim()
        if (-not $name) {
            continue
        }

        $value = $line.Substring($idx + 1).Trim()
        if ($value.Length -ge 2) {
            $first = $value[0]
            $last = $value[$value.Length - 1]
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
                $value = $value.Replace('\n', [Environment]::NewLine).Replace('\"', '"').Replace('\\', '\')
            }
        }

        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Get-EnvValue {
    param([string[]]$Names)

    foreach ($name in $Names) {
        if (-not $name) {
            continue
        }
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    return $null
}

function Normalize-HttpHost {
    param([string]$RawHost)

    $trimmed = ''
    if ($null -ne $RawHost) {
        $trimmed = $RawHost.Trim()
    }
    if (-not $trimmed -or $trimmed -eq '0.0.0.0' -or $trimmed -eq '::' -or $trimmed -eq '[::]') {
        return '127.0.0.1'
    }
    return $trimmed.Trim('[', ']')
}

function Resolve-BaseUrl {
    $explicit = Get-EnvValue @('VLA_HTTP_BASE')
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return $explicit.TrimEnd('/')
    }

    $httpHost = Normalize-HttpHost (Get-EnvValue @('VLA_HTTP_BIND'))
    $port = Get-EnvValue @('VLA_HTTP_PORT')
    if (-not [string]::IsNullOrWhiteSpace($port)) {
        return "http://${httpHost}:$port"
    }

    return 'http://127.0.0.1:8090'
}

function Get-HttpStatus {
    param([string]$Uri, [hashtable]$Headers = @{})

    try {
        $r = Invoke-WebRequest -Uri $Uri -Method GET -Headers $Headers -UseBasicParsing -ErrorAction Stop
        return [int]$r.StatusCode
    } catch {
        $resp = $_.Exception.Response
        if ($null -ne $resp) {
            return [int]$resp.StatusCode
        }
        throw
    }
}

function Test-Status {
    param([string]$Name, [string]$Uri, [int[]]$Want, [hashtable]$Headers = @{})

    try {
        $code = Get-HttpStatus -Uri $Uri -Headers $Headers
    } catch {
        Write-Host "[FAIL] $Name : $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return
    }

    if ($Want -contains $code) {
        Write-Host "[ OK ] $Name : HTTP $code" -ForegroundColor Green
        return
    }

    Write-Host "[FAIL] $Name : HTTP $code (expect $($Want -join '/'))" -ForegroundColor Red
    $script:failed++
}

Import-EnvFile (Join-Path $root '.env.velocity.generated')
Import-EnvFile (Join-Path $root '.env.velocity')

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = Resolve-BaseUrl
} else {
    $BaseUrl = $BaseUrl.TrimEnd('/')
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = Get-EnvValue @('VLA_HTTP_API_KEY', 'VLA_API_KEY')
}

Write-Host "HTTP API security check  BaseUrl=$BaseUrl" -ForegroundColor Cyan

Test-Status -Name "GET /v1/health (public)" -Uri "$BaseUrl/v1/health" -Want @(200, 503)
Test-Status -Name "GET /v1/metrics/prometheus (no key)" -Uri "$BaseUrl/v1/metrics/prometheus" -Want @(401)
Test-Status -Name "GET /v1/user/exists (no key)" -Uri "$BaseUrl/v1/user/exists?name=test" -Want @(401)

if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
    $h = @{ 'X-API-Key' = $ApiKey }
    try {
        $code = Get-HttpStatus -Uri "$BaseUrl/v1/metrics/prometheus" -Headers $h
    } catch {
        Write-Host "[WARN] Keyed request failed: $($_.Exception.Message)" -ForegroundColor Yellow
        $script:failed++
        $code = -1
    }

    if ($code -eq 200) {
        Write-Host "[ OK ] GET /v1/metrics/prometheus (with X-API-Key) : HTTP 200" -ForegroundColor Green
    } elseif ($code -ge 0) {
        Write-Host "[WARN] GET /v1/metrics/prometheus (with key) : HTTP $code (match http-api.api-key to VLA_HTTP_API_KEY or -ApiKey)" -ForegroundColor Yellow
        $script:failed++
    }
} else {
    Write-Host "[SKIP] VLA_HTTP_API_KEY / VLA_API_KEY not set; skip keyed request test" -ForegroundColor DarkGray
}

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "Failed count: $failed. Ensure proxy is running and BaseUrl matches http-api bind/port." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "All checks passed." -ForegroundColor Green
exit 0
