#Requires -Version 5.1
# 将 StarX + LimboAPI patched jar 复制到本目录 plugins/
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$starxRoot = Join-Path $here "..\starx-plugins"
$targetDir = Join-Path $here "plugins"

if (-not (Test-Path $starxRoot)) {
    Write-Host "未找到 starx-plugins 目录: $starxRoot" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
}

# ----- 清理 -----

# 清理旧的 StarVelocity / StarX JAR
Get-ChildItem -Path $targetDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "StarVelocity-*.jar" -or $_.Name -like "starx-*.jar" } |
    Remove-Item -Force

# 清理旧的 LimboAPI JAR（确保只有最新的 patched jar）
Get-ChildItem -Path $targetDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "limboapi-*.jar" } |
    Remove-Item -Force

# ----- 复制 -----

# 复制 StarX Velocity 插件
$velocityJar = Join-Path $starxRoot "starx-velocity\build\libs\starx-velocity*.jar"
$velocityFiles = Get-ChildItem -Path $velocityJar -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "original|shaded" } |
    Sort-Object LastWriteTime -Descending

if ($velocityFiles) {
    $src = $velocityFiles[0]
    $dest = Join-Path $targetDir $src.Name
    Copy-Item -LiteralPath $src.FullName -Destination $dest -Force
    Write-Host "已复制 Velocity: $($src.Name) -> plugins\" -ForegroundColor Green
} else {
    Write-Host "未找到 starx-velocity JAR，请先运行: cd starx-plugins && ./gradlew :starx-velocity:shadowJar" -ForegroundColor Yellow
}

# 复制 StarX Paper 插件
$paperJar = Join-Path $starxRoot "starx-paper\build\libs\starx-paper*.jar"
$paperFiles = Get-ChildItem -Path $paperJar -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "original|shaded" } |
    Sort-Object LastWriteTime -Descending

if ($paperFiles) {
    $src = $paperFiles[0]
    $dest = Join-Path $targetDir $src.Name
    Copy-Item -LiteralPath $src.FullName -Destination $dest -Force
    Write-Host "已复制 Paper:   $($src.Name) -> plugins\" -ForegroundColor Green
} else {
    Write-Host "未找到 starx-paper JAR，请先运行: cd starx-plugins && ./gradlew :starx-paper:shadowJar" -ForegroundColor Yellow
}

# 复制 patched LimboAPI JAR
$limboJarPattern = Join-Path $starxRoot "limboapi-plugins\build\libs\limboapi-*-patched.jar"
$limboFiles = Get-ChildItem -Path $limboJarPattern -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

if ($limboFiles) {
    $src = $limboFiles[0]
    $dest = Join-Path $targetDir $src.Name
    Copy-Item -LiteralPath $src.FullName -Destination $dest -Force
    Write-Host "已复制 LimboAPI: $($src.Name) -> plugins\" -ForegroundColor Green
} else {
    Write-Host "未找到 patched LimboAPI JAR，请先运行: cd starx-plugins && ./gradlew buildPatchedLimboAPI" -ForegroundColor Yellow
}