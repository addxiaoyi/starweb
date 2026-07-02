#requires -Version 5.1
<#
.SYNOPSIS
  AuthX / VLA 联调冒烟：站点插件桥 +（可选）直连 VLA /v1。

.EXAMPLE
  # 仅测站点（VLA 模式，插件 8090）
  $env:AUTHX_PLUGIN_ADAPTER='vla'
  $env:AUTHX_VLA_API_KEY='replace-with-long-random-key'
  $env:AUTHX_PLUGIN_BASE='http://127.0.0.1:8090'
  .\authx-smoke.ps1 -ApiBase 'https://www.star-web.top'

.EXAMPLE
  # 同时打 VLA 只读接口
  .\authx-smoke.ps1 -ApiBase 'https://www.star-web.top' -VlaBase 'http://127.0.0.1:8090' -VlaApiKey '***'
#>
param(
  [string]$ApiBase = 'https://www.star-web.top',
  [string]$AdminSecret = '',
  [string]$VlaBase = '',
  [string]$VlaApiKey = '',
  [switch]$SkipAdminPosts
)

$ErrorActionPreference = 'Stop'
function Test-Url {
  param([string]$Name, [scriptblock]$Call)
  Write-Host "== $Name" -ForegroundColor Cyan
  try {
    & $Call
    Write-Host "  OK" -ForegroundColor Green
  } catch {
    Write-Host "  FAIL: $_" -ForegroundColor Red
  }
}

$hdr = @{ Accept = 'application/json' }
if ($AdminSecret) { $hdr['X-Admin-Secret'] = $AdminSecret }

Test-Url 'GET /api/health' {
  $r = Invoke-RestMethod -Uri "$ApiBase/api/health" -Headers $hdr -Method Get
  if (-not $r) { throw 'empty' }
}

Test-Url 'GET /api/admin/authx/plugin-health' {
  $r = Invoke-RestMethod -Uri "$ApiBase/api/admin/authx/plugin-health" -Headers $hdr -Method Get
  if (-not $r.ok) { throw ($r | ConvertTo-Json -Compress) }
}

if ($AdminSecret) {
  Test-Url 'GET /api/admin/authx/user-exists?name=test' {
    try {
      Invoke-RestMethod -Uri "$ApiBase/api/admin/authx/user-exists?name=test" -Headers $hdr -Method Get | Out-Null
    } catch {
      $resp = $_.Exception.Response
      if ($null -ne $resp -and [int]$resp.StatusCode -eq 400) {
        Write-Host "  skip（AUTHX_PLUGIN_ADAPTER 非 vla）" -ForegroundColor DarkYellow
        return
      }
      throw
    }
  }
}

if (-not $SkipAdminPosts) {
  Test-Url 'POST /api/admin/authx/reset-password (probe)' {
    $body = '{"username":"__smoke_nonexistent__","newPassword":"ab12cd56"}'
    try {
      $r = Invoke-WebRequest -Uri "$ApiBase/api/admin/authx/reset-password" -Headers $hdr -Method Post `
        -Body $body -ContentType 'application/json; charset=utf-8' -UseBasicParsing
      Write-Host "  HTTP $($r.StatusCode)"
    } catch {
      $resp = $_.Exception.Response
      if ($null -eq $resp) { throw }
      $code = [int]$resp.StatusCode
      # 403 writes_disabled / 401 未授权 / 400 密码格式 等均说明桥接已打到插件
      if ($code -ge 400 -and $code -lt 600) {
        Write-Host "  HTTP $code（桥接可达；403 多为 VLA allow-writes:false）" -ForegroundColor DarkYellow
        return
      }
      throw
    }
  }
}

if ($VlaBase -and $VlaApiKey) {
  $vh = @{ 'X-API-Key' = $VlaApiKey; Accept = 'application/json' }
  Test-Url 'VLA GET /v1/health' {
    Invoke-RestMethod -Uri "$VlaBase/v1/health" -Method Get | Out-Null
  }
  Test-Url 'VLA GET /v1/user/exists?name=test' {
    Invoke-RestMethod -Uri "$VlaBase/v1/user/exists?name=test" -Headers $vh -Method Get | Out-Null
  }
  Test-Url 'VLA GET /v1/metrics/prometheus' {
    $r = Invoke-WebRequest -Uri "$VlaBase/v1/metrics/prometheus" -Headers $vh -Method Get -UseBasicParsing
    if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 300) { throw $r.StatusCode }
  }
}

if ($AdminSecret) {
  Test-Url 'GET /api/admin/authx/plugin-metrics' {
    try {
      $r = Invoke-WebRequest -Uri "$ApiBase/api/admin/authx/plugin-metrics" -Headers $hdr -Method Get -UseBasicParsing
      if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 300) { throw $r.StatusCode }
    } catch {
      $w = $_.Exception
      if ($null -ne $w.Response -and [int]$w.Response.StatusCode -eq 400) {
        Write-Host "  skip（AUTHX_PLUGIN_ADAPTER 非 vla）" -ForegroundColor DarkYellow
        return
      }
      throw
    }
  }
}

Write-Host "`n完成。若 reset-password 因 403 writes_disabled 失败，请在 VLA config 设 http-api.allow-writes: true。" -ForegroundColor Yellow
