# 读取 表情.md 文件（假设文件名固定）
$content = Get-Content -Path ".\表情.md" -Raw

# 匹配所有 { keys: ['/xxx', '/yyy'], name: 'zzz.gif' } 模式
$pattern = "{\s*keys:\s*\[([^\]]+)\],\s*name:\s*'([^']+)'"
$matches = [regex]::Matches($content, $pattern)

$outputLines = @()
$outputLines += "// 自动生成，请勿手动编辑"
$outputLines += "module.exports = {"

foreach ($match in $matches) {
    $keysStr = $match.Groups[1].Value
    $fileName = $match.Groups[2].Value
    # 分割 keys
    $keys = $keysStr -split ',' | ForEach-Object { $_.Trim().Trim("'") -replace "^'", '' -replace "'$", '' }
    foreach ($k in $keys) {
        # 转义单引号
        $escapedKey = $k -replace "'", "\'"
        $outputLines += "    '$escapedKey': '$fileName',"
    }
}

$outputLines += "};"
$outputLines | Out-File -FilePath ".\emotions.js" -Encoding utf8
Write-Host "✅ emotions.js 已生成"