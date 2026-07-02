#Requires -Version 5.1
param(
    [ValidateSet('auto', 'default', 'velocity35')]
    [string] $Variant = 'auto'
)

# 将 velocity-limbo-auth 模块构建的 jar 复制到本目录 plugins/
# default: Java17 / Velocity 3.4 API
# velocity35: Java21 / Velocity 3.5 API
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$moduleRoot = Join-Path $here "..\velocity-limbo-auth"
$targetDir = Join-Path $here "plugins"
if (-not (Test-Path $moduleRoot)) {
    Write-Host "未找到 velocity-limbo-auth 目录: $moduleRoot" -ForegroundColor Red
    exit 1
}
$targetRoot = Join-Path $moduleRoot "target"
$pattern = switch ($Variant) {
    'default' { 'StarVelocity-4.0.0.jar' }
    'velocity35' { 'StarVelocity-4.0.0-velocity35-java21.jar' }
    default { 'StarVelocity-*.jar' }
}
$jars = Get-ChildItem -Path $targetRoot -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $pattern -or ($Variant -eq 'auto' -and $_.Name -like "Velocity-Limbo-Auth*.jar") } |
    Where-Object { $_.Name -notmatch "original|shaded" } |
    Sort-Object LastWriteTime -Descending
if (-not $jars) {
    Write-Host "未找到构建产物: $pattern" -ForegroundColor Yellow
    Write-Host "默认构建:  在 velocity-limbo-auth 目录执行 mvn -U clean package" -ForegroundColor Yellow
    Write-Host "Velocity 3.5: 在 velocity-limbo-auth 目录执行 mvn -U -Pvelocity35 clean package" -ForegroundColor Yellow
    exit 1
}
$src = $jars[0]
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
}

Get-ChildItem -Path $targetDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "StarVelocity-*.jar" -or $_.Name -like "Velocity-Limbo-Auth*.jar" } |
    Remove-Item -Force

$dest = Join-Path $targetDir $src.Name
Copy-Item -LiteralPath $src.FullName -Destination $dest -Force
Write-Host "已复制: $($src.Name) -> plugins\" -ForegroundColor Green
Write-Host "  来源: $($src.FullName)"
