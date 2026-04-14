# Run this from c:\VoyixMobile\bff\
# Downloads product images from Unsplash and saves to public\images\
#
# If you get SSL errors, run this first in the same PowerShell window:
#   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Force TLS 1.2 and bypass cert validation (needed on some corporate networks)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
add-type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAll : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) { return true; }
}
"@
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAll

$outDir = ".\public\images"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$items = @(
  @{ id="1";    url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="2";    url="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="3";    url="https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="4";    url="https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="5";    url="https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="6";    url="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="w001"; url="https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="w002"; url="https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="w003"; url="https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="w004"; url="https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="w005"; url="https://images.unsplash.com/photo-1509551388413-e18d0ac5d495?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="w006"; url="https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="m001"; url="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="m002"; url="https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="m003"; url="https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="m004"; url="https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="k001"; url="https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="k002"; url="https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="k003"; url="https://images.unsplash.com/photo-1522771930-78848d9293e8?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="k004"; url="https://images.unsplash.com/photo-1604917877934-07d58b7cba58?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="h001"; url="https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="h002"; url="https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="h003"; url="https://images.unsplash.com/photo-1600369671854-5b88b5848638?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="h004"; url="https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="h005"; url="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="t001"; url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="t002"; url="https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="t003"; url="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="t004"; url="https://images.unsplash.com/photo-1583863788434-e62294a05543?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="y001"; url="https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="y002"; url="https://images.unsplash.com/photo-1535572290543-960a8046f5af?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="y003"; url="https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="y004"; url="https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="e001"; url="https://images.unsplash.com/photo-1585914641050-fa3eda310b14?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="e002"; url="https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="e003"; url="https://images.unsplash.com/photo-1599599810694-b5b37304c041?w=400&h=400&fit=crop&auto=format&q=80" },
  @{ id="e004"; url="https://images.unsplash.com/photo-1520209759809-a9bcb6cb3241?w=400&h=400&fit=crop&auto=format&q=80" }
)

$ok = 0; $fail = 0
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

foreach ($item in $items) {
  $dest = (Resolve-Path $outDir).Path + "\$($item.id).jpg"
  try {
    $wc.DownloadFile($item.url, $dest)
    $size = (Get-Item $dest).Length
    Write-Host "OK  $($item.id.PadRight(5))  ($size bytes)"
    $ok++
  } catch {
    Write-Host "ERR $($item.id.PadRight(5))  - $($_.Exception.Message)"
    $fail++
  }
}

Write-Host "`n$ok downloaded, $fail failed"
Write-Host "`nNext steps:"
Write-Host "  git add bff/public/images/"
Write-Host "  git commit -m 'feat: add product images'"
Write-Host "  git push"
Write-Host "  cd bff && npx tsx src/seed-item-attributes.ts"
