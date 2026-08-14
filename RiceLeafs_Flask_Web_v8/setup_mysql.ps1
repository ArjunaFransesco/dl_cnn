$ErrorActionPreference = 'Stop'

$schemaPath = Join-Path $PSScriptRoot 'database\mysql_schema.sql'
$envExamplePath = Join-Path $PSScriptRoot '.env.example'
$envPath = Join-Path $PSScriptRoot '.env'

$laragonClient = Get-ChildItem -LiteralPath 'C:\laragon\bin\mysql' -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'bin\mysql.exe' } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

$xamppClient = 'C:\xampp\mysql\bin\mysql.exe'
$mysqlClient = if ($laragonClient) {
    $laragonClient
} elseif (Test-Path -LiteralPath $xamppClient) {
    $xamppClient
} else {
    $null
}

if (-not $mysqlClient) {
    throw 'Client MySQL Laragon/XAMPP tidak ditemukan. Instal Laragon atau sesuaikan DATABASE_URL pada file .env.'
}

if (-not (Test-Path -LiteralPath $schemaPath)) {
    throw 'File database\mysql_schema.sql tidak ditemukan.'
}

Write-Host 'Menyiapkan database riceleafs_db...' -ForegroundColor Green
Write-Host "Client: $mysqlClient"
Get-Content -LiteralPath $schemaPath -Raw | & $mysqlClient -h 127.0.0.1 -P 3306 -u root

if ($LASTEXITCODE -ne 0) {
    throw 'MySQL belum aktif atau kredensial root berbeda. Aktifkan MySQL di Laragon, lalu jalankan kembali setup_mysql.ps1.'
}

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
}

Write-Host 'Database dan tabel classification_history siap digunakan.' -ForegroundColor Green
