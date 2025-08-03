# Development convenience scripts for npm workspace
# Run these from the campaign-engine directory
param([string]$Command)

switch ($Command) {
    "start" {
        Write-Host "🚀 Starting Campaign Engine..." -ForegroundColor Green
        Set-Location "c:\Users\Admin\Documents\coding\tamyla"
        npm run start --workspace=campaign-engine
    }
    "dev" {
        Write-Host "🔧 Starting Campaign Engine in dev mode..." -ForegroundColor Yellow
        Set-Location "c:\Users\Admin\Documents\coding\tamyla"
        npm run dev --workspace=campaign-engine
    }
    "test" {
        Write-Host "🧪 Running tests..." -ForegroundColor Blue
        Set-Location "c:\Users\Admin\Documents\coding\tamyla"
        npm run test --workspace=campaign-engine
    }
    "migrate" {
        Write-Host "📊 Running database migrations..." -ForegroundColor Cyan
        Set-Location "c:\Users\Admin\Documents\coding\tamyla"
        npm run migrate --workspace=campaign-engine
    }
    "direct" {
        Write-Host "⚡ Direct node execution..." -ForegroundColor Magenta
        node src/index.js
    }
    default {
        Write-Host "Usage: .\dev.ps1 [start|dev|test|migrate|direct]" -ForegroundColor White
        Write-Host ""
        Write-Host "Available commands:" -ForegroundColor White
        Write-Host "  start   - Start the application using workspace command" -ForegroundColor Gray
        Write-Host "  dev     - Start in development mode with nodemon" -ForegroundColor Gray
        Write-Host "  test    - Run the test suite" -ForegroundColor Gray
        Write-Host "  migrate - Run database migrations" -ForegroundColor Gray
        Write-Host "  direct  - Direct node execution (bypass npm)" -ForegroundColor Gray
    }
}
