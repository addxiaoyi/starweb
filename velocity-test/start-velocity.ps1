#Requires -Version 5.1
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $JavaArgs
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location -LiteralPath $root

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

    Write-Host "已加载环境文件: $Path" -ForegroundColor DarkCyan
}

Import-EnvFile (Join-Path $root '.env.velocity.generated')
Import-EnvFile (Join-Path $root '.env.velocity')

# 优先选版本号较新的 Velocity jar（例如 velocity-3.5.1-xxx.jar），
# 排除无版本号的 empty placeholder velocity.jar。
$jars = Get-ChildItem -LiteralPath $root -Filter 'velocity*.jar' -File |
    Where-Object { $_.Name -ne 'velocity.jar' } |
    Sort-Object Length -Descending
$jar = $jars | Select-Object -First 1
if (-not $jar) {
    # fallback: allow velocity.jar if nothing else found
    $jar = Get-ChildItem -LiteralPath $root -Filter 'velocity*.jar' -File |
        Sort-Object Length -Descending | Select-Object -First 1
}
if (-not $jar) {
    Write-Host "未找到 velocity*.jar。请从 https://papermc.io/downloads/velocity 下载 Velocity（3.4.x 配 Java 17+，3.5.x 配 Java 21+），将 jar 放在本目录。" -ForegroundColor Yellow
    Write-Host 'No velocity jar found. Download Velocity from Paper and place the jar in this directory.' -ForegroundColor Yellow
    exit 1
}

$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) {
    Write-Host "未在 PATH 中找到 java。请安装 Java 17+（3.4 代理）或 Java 21+（3.5 代理）。" -ForegroundColor Yellow
    Write-Host 'java not in PATH. Install Java 17+ for Velocity 3.4 or Java 21+ for Velocity 3.5.' -ForegroundColor Yellow
    exit 1
}
$javaPath = (& where.exe java 2>$null | Select-Object -First 1)
if (-not $javaPath) {
    Write-Host 'java command was found, but the executable path could not be resolved.' -ForegroundColor Yellow
    exit 1
}

$launchArgs = @(
    '-Xms512M',
    '-Xmx512M',
    '-jar',
    [string] $jar.FullName
) + @($JavaArgs | Where-Object { $_ -ne $null -and $_ -ne '' })

Write-Host ("Using {0}, working directory: {1}" -f $jar.Name, $root) -ForegroundColor Cyan
$process = Start-Process -FilePath $javaPath -ArgumentList $launchArgs -WorkingDirectory $root -NoNewWindow -Wait -PassThru
exit $process.ExitCode
