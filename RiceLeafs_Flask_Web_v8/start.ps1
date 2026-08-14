$ErrorActionPreference = 'Stop'

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$pythonArgs = @()

if (-not $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
    $pythonArgs = @('-3.11')
}

if (-not $pythonCommand) {
    throw 'Python tidak ditemukan. Instal Python 3.11 dari python.org dan aktifkan Add Python to PATH.'
}

if (-not (Test-Path -LiteralPath '.venv')) {
    Write-Host 'Membuat virtual environment...' -ForegroundColor Green
    & $pythonCommand.Source @pythonArgs -m venv .venv
}

Write-Host 'Memastikan dependency terpasang...' -ForegroundColor Green
& '.\.venv\Scripts\python.exe' -m pip install --upgrade pip
& '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt

Write-Host ''
Write-Host 'PadiLens siap di http://127.0.0.1:5000' -ForegroundColor Green
Write-Host 'Biarkan jendela ini terbuka. Tekan Ctrl+C untuk menghentikan server.'
& '.\.venv\Scripts\python.exe' wsgi.py
