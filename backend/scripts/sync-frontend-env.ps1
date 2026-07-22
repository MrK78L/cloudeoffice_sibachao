param(
  [string]$StackName = "cloffice-backend",
  [string]$Region = "ap-southeast-1",
  [string]$FrontendEnvPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $FrontendEnvPath) {
  $FrontendEnvPath = Join-Path (Split-Path $PSScriptRoot -Parent) "..\frontend\.env.development.local"
}

$outputsJson = aws cloudformation describe-stacks `
  --stack-name $StackName `
  --region $Region `
  --query "Stacks[0].Outputs" `
  --output json

if ($LASTEXITCODE -ne 0) {
  throw "Cannot read CloudFormation outputs for stack '$StackName'."
}

$outputs = $outputsJson | ConvertFrom-Json
$values = @{}
foreach ($output in $outputs) {
  $values[$output.OutputKey] = $output.OutputValue
}

foreach ($required in @("ApiUrl", "CognitoUserPoolId", "CognitoClientId")) {
  if (-not $values[$required]) {
    throw "CloudFormation output '$required' is missing."
  }
}

$lines = @(
  "VITE_API_BASE_URL=$($values.ApiUrl.TrimEnd('/'))",
  "VITE_COGNITO_USER_POOL_ID=$($values.CognitoUserPoolId)",
  "VITE_COGNITO_CLIENT_ID=$($values.CognitoClientId)",
  "VITE_USE_DEMO_FALLBACK=false",
  "VITE_BYPASS_ADMIN_AUTH=false"
)

$resolvedPath = [System.IO.Path]::GetFullPath($FrontendEnvPath)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($resolvedPath, (($lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)

Write-Host "Frontend development environment updated: $resolvedPath"
Write-Host "API: $($values.ApiUrl)"
Write-Host "Cognito User Pool: $($values.CognitoUserPoolId)"
