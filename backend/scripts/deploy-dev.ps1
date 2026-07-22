param(
  [string]$StackName = "cloffice-backend",
  [string]$Region = "ap-southeast-1",
  [string]$ProjectName = "cloffice",
  [string]$AlertEmail = "phuocloc782004@gmail.com",
  [string]$CorsOrigin = "http://localhost:5173",
  [switch]$NoConfirm
)

$ErrorActionPreference = "Stop"
$backendRoot = Split-Path $PSScriptRoot -Parent

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is not running. Start Docker Desktop and run this command again."
}

aws sts get-caller-identity --region $Region --output json *> $null
if ($LASTEXITCODE -ne 0) {
  throw "AWS CLI credentials are unavailable or expired. Run 'aws configure' or refresh your AWS session."
}

Push-Location $backendRoot
try {
  npm test
  if ($LASTEXITCODE -ne 0) { throw "Backend tests failed." }

  sam validate --template-file infra\template.yaml --lint --region $Region
  if ($LASTEXITCODE -ne 0) { throw "SAM validation failed." }

  sam build --use-container --config-file samconfig.toml --no-cached
  if ($LASTEXITCODE -ne 0) { throw "SAM container build failed." }

  $deployArguments = @(
    "deploy",
    "--config-file", "samconfig.toml",
    "--template-file", ".aws-sam\build\template.yaml",
    "--stack-name", $StackName,
    "--region", $Region,
    "--resolve-s3",
    "--capabilities", "CAPABILITY_IAM",
    "--parameter-overrides",
    "ProjectName=$ProjectName",
    "AlertEmail=$AlertEmail",
    "CorsAllowOrigin=$CorsOrigin",
    "EnablePointInTimeRecovery=false",
    "EnableCloudFront=false"
  )
  if ($NoConfirm) { $deployArguments += "--no-confirm-changeset" }

  & sam @deployArguments
  if ($LASTEXITCODE -ne 0) { throw "SAM deploy failed." }

  & "$PSScriptRoot\sync-frontend-env.ps1" -StackName $StackName -Region $Region
} finally {
  Pop-Location
}

Write-Host "Backend dev stack is ready. CloudFront, WAF and DynamoDB PITR remain disabled."
Write-Host "Run the frontend at http://localhost:5173 with: npm run frontend:dev:aws"
