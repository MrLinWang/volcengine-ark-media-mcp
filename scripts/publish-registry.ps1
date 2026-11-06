$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root "tools"
$Publisher = Join-Path $Tools "mcp-publisher.exe"
$ServerJson = Join-Path $Root "server.json"

if (-not (Test-Path $ServerJson)) {
  throw "server.json not found: $ServerJson"
}

if (-not (Test-Path $Publisher)) {
  New-Item -ItemType Directory -Force -Path $Tools | Out-Null

  Write-Host "Looking up the latest mcp-publisher release..."
  $Release = Invoke-RestMethod -NoProxy -Uri "https://api.github.com/repos/modelcontextprotocol/registry/releases/latest"
  $Asset = $Release.assets | Where-Object { $_.name -eq "mcp-publisher_windows_amd64.tar.gz" } | Select-Object -First 1
  if (-not $Asset) {
    throw "mcp-publisher_windows_amd64.tar.gz not found in the latest release"
  }

  $Archive = Join-Path $Tools $Asset.name
  Write-Host "Downloading $($Asset.browser_download_url)"
  Invoke-WebRequest -NoProxy -Uri $Asset.browser_download_url -OutFile $Archive
  tar -xzf $Archive -C $Tools
  Remove-Item -LiteralPath $Archive -Force
}

Write-Host "Validating server.json..."
& $Publisher validate $ServerJson
if ($LASTEXITCODE -ne 0) {
  throw "server.json validation failed"
}

Write-Host "Opening GitHub login for the MCP Registry..."
& $Publisher login github
if ($LASTEXITCODE -ne 0) {
  throw "mcp-publisher login failed"
}

Write-Host "Publishing to the official MCP Registry..."
& $Publisher publish $ServerJson
if ($LASTEXITCODE -ne 0) {
  throw "mcp-publisher publish failed"
}

Write-Host ""
Write-Host "Done. Verify with:"
Write-Host '  curl "https://registry.modelcontextprotocol.io/v0/servers?search=volcengine&limit=10&version=latest"'
