param(
  [string]$BaseUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"
$script:Failures = 0
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$testOfficeId = "test-office-$stamp"
$testContractId = "test-contract-$stamp"
$requestId = $null

$adminHeaders = @{
  "Authorization" = "Bearer local-dev"
  "x-dev-user-id" = "local-admin"
  "x-dev-user-email" = "admin@local.test"
  "x-dev-user-groups" = "admin"
}

$userHeaders = @{
  "Authorization" = "Bearer local-dev"
  "x-dev-user-id" = "local-user"
  "x-dev-user-email" = "qa.customer@example.com"
}

function Invoke-TestApi {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $uri = "$BaseUrl$Path"
  $params = @{
    Uri = $uri
    Method = $Method
    Headers = $Headers
    UseBasicParsing = $true
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    $response = Invoke-WebRequest @params
    $json = $null
    if ($response.Content) {
      try {
        $json = $response.Content | ConvertFrom-Json
      } catch {
        $json = $response.Content
      }
    }
    Write-Host "[PASS] $Method $Path - $Name ($($response.StatusCode))" -ForegroundColor Green
    return $json
  } catch {
    $script:Failures += 1
    $status = $_.Exception.Response.StatusCode.value__
    $content = ""
    try {
      $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
      $content = $reader.ReadToEnd()
    } catch {}
    Write-Host "[FAIL] $Method $Path - $Name ($status)" -ForegroundColor Red
    if ($content) { Write-Host $content -ForegroundColor DarkRed }
    return $null
  }
}

Write-Host "== Public APIs ==" -ForegroundColor Cyan
Invoke-TestApi "List offices" "GET" "/offices"
Invoke-TestApi "Get seeded office" "GET" "/offices/office-d1-1201"

Write-Host "`n== Authenticated user APIs ==" -ForegroundColor Cyan
$rental = Invoke-TestApi "Create rental request" "POST" "/rental-requests" $userHeaders @{
  officeId = "office-d1-1201"
  customerName = "QA Customer"
  email = "qa.customer@example.com"
  phone = "0900000000"
  message = "Local API test rental request"
}

if ($rental -and $rental.item -and $rental.item.id) {
  $requestId = $rental.item.id
  Invoke-TestApi "Get own rental request" "GET" "/rental-requests/$requestId" $userHeaders
}

Write-Host "`n== Admin office APIs ==" -ForegroundColor Cyan
Invoke-TestApi "Admin stats" "GET" "/admin/stats" $adminHeaders
Invoke-TestApi "Admin list offices" "GET" "/admin/offices" $adminHeaders
Invoke-TestApi "Admin create office" "POST" "/admin/offices" $adminHeaders @{
  id = $testOfficeId
  title = "Test Office $stamp"
  address = "Local test address"
  areaSqm = 55
  monthlyPrice = 25000000
  status = "AVAILABLE"
  description = "Created by local API test"
  imageUrl = "https://example.com/office.jpg"
  amenities = @("Wifi", "Meeting room")
}
Invoke-TestApi "Admin get office" "GET" "/admin/offices/$testOfficeId" $adminHeaders
Invoke-TestApi "Admin update office" "PATCH" "/admin/offices/$testOfficeId" $adminHeaders @{
  status = "RESERVED"
  monthlyPrice = 27000000
}

Write-Host "`n== Admin rental request APIs ==" -ForegroundColor Cyan
Invoke-TestApi "Admin list rental requests" "GET" "/admin/rental-requests" $adminHeaders
if ($requestId) {
  Invoke-TestApi "Admin get rental request" "GET" "/admin/rental-requests/$requestId" $adminHeaders
  Invoke-TestApi "Admin approve rental request" "PATCH" "/admin/rental-requests/$requestId" $adminHeaders @{
    status = "APPROVED"
    decisionNote = "Approved by local API test"
  }
}

Write-Host "`n== Admin customer APIs ==" -ForegroundColor Cyan
Invoke-TestApi "Admin list customers" "GET" "/admin/customers" $adminHeaders
Invoke-TestApi "Admin get customer" "GET" "/admin/customers/qa.customer@example.com" $adminHeaders
Invoke-TestApi "Admin update customer" "PATCH" "/admin/customers/qa.customer@example.com" $adminHeaders @{
  name = "QA Customer Updated"
  phone = "0911111111"
  status = "ACTIVE"
}

Write-Host "`n== Admin contract APIs ==" -ForegroundColor Cyan
Invoke-TestApi "Admin list contracts" "GET" "/admin/contracts" $adminHeaders
Invoke-TestApi "Admin create contract" "POST" "/admin/contracts" $adminHeaders @{
  id = $testContractId
  officeId = $testOfficeId
  customerId = "qa.customer@example.com"
  rentalRequestId = $requestId
  title = "Local test contract"
  status = "DRAFT"
  startDate = "2026-08-01"
  endDate = "2027-07-31"
  monthlyPrice = 27000000
}
Invoke-TestApi "Admin get contract" "GET" "/admin/contracts/$testContractId" $adminHeaders
Invoke-TestApi "Admin update contract" "PATCH" "/admin/contracts/$testContractId" $adminHeaders @{
  status = "ACTIVE"
}
Invoke-TestApi "Admin transition contract to terminated" "PATCH" "/admin/contracts/$testContractId" $adminHeaders @{
  status = "TERMINATED"
}
Invoke-TestApi "Admin archive terminated contract" "DELETE" "/admin/contracts/$testContractId" $adminHeaders

Write-Host "`n== Appointment APIs ==" -ForegroundColor Cyan
$appointment = Invoke-TestApi "Create appointment" "POST" "/appointments" $userHeaders @{
  officeId = "office-d1-1201"
  customerName = "QA Customer"
  email = "qa.customer@example.com"
  phone = "0900000000"
  scheduledAt = (Get-Date).ToUniversalTime().AddDays(7).ToString("o")
  note = "Local API appointment test"
}
Invoke-TestApi "Admin list appointments" "GET" "/admin/appointments" $adminHeaders
if ($appointment -and $appointment.item -and $appointment.item.id) {
  Invoke-TestApi "Admin confirm appointment" "PATCH" "/admin/appointments/$($appointment.item.id)" $adminHeaders @{
    status = "CONFIRMED"
  }
}

Write-Host "`n== Report APIs ==" -ForegroundColor Cyan
Invoke-TestApi "Export office report" "GET" "/admin/reports/offices.csv" $adminHeaders

Write-Host "`n== Cleanup APIs ==" -ForegroundColor Cyan
if ($requestId) {
  Invoke-TestApi "Admin reject completed test request" "PATCH" "/admin/rental-requests/$requestId" $adminHeaders @{
    status = "REJECTED"
    decisionNote = "Cleanup local test"
  }
  Invoke-TestApi "Admin cancel rental request" "DELETE" "/admin/rental-requests/$requestId" $adminHeaders
}
Invoke-TestApi "Admin delete office" "DELETE" "/admin/offices/$testOfficeId" $adminHeaders
Invoke-TestApi "Admin delete customer" "DELETE" "/admin/customers/qa.customer@example.com" $adminHeaders

Write-Host "`nSkipped upload-url APIs because they require S3 or LocalStack." -ForegroundColor Yellow

if ($script:Failures -gt 0) {
  Write-Host "`nCompleted with $script:Failures failure(s)." -ForegroundColor Red
  exit 1
}

Write-Host "`nAll tested APIs passed." -ForegroundColor Green
