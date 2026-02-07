$body = @{
  fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  depth = 2
  time = 1.5
} | ConvertTo-Json

try {
  Write-Host "Request body:" -ForegroundColor DarkGray
  Write-Host $body
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    $tmp = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tmp -Value $body -Encoding UTF8
    $response = curl.exe -s -X POST "http://127.0.0.1:8001/ai-move" -H "Content-Type: application/json" --data-binary "@$tmp"
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Write-Host "AI response:" -ForegroundColor Green
    Write-Host $response
  } else {
    $headers = @{ "Content-Type" = "application/json" }
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8001/ai-move" -Method Post -Headers $headers -Body $body -TimeoutSec 10 -ErrorAction Stop
    Write-Host "AI response:" -ForegroundColor Green
    Write-Host $response.StatusCode
    Write-Host $response.Content
  }
} catch {
  Write-Host "AI request failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.Exception.Response) {
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      Write-Host ($reader.ReadToEnd())
    } catch {
      Write-Host "No response body."
    }
  }
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    Write-Host $_.ErrorDetails.Message
  }
}
