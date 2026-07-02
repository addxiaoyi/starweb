#Requires -Version 5.1
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Args
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location -LiteralPath $root

& node (Join-Path $root 'tools/paper-backend-helper.mjs') down @Args
exit $LASTEXITCODE
