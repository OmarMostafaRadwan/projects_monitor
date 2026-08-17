# Installs the setup-push-reports skill into %USERPROFILE%\.claude\skills.
#
#   irm https://raw.githubusercontent.com/OmarMostafaRadwan/projects_monitor/main/install.ps1 | iex
#
# Installs to the PERSONAL skills directory rather than a project's, because
# the whole point is onboarding arbitrary repos.

$ErrorActionPreference = "Stop"

$Repo   = if ($env:PUSH_REPORTS_REPO)   { $env:PUSH_REPORTS_REPO }   else { "OmarMostafaRadwan/projects_monitor" }
$Branch = if ($env:PUSH_REPORTS_BRANCH) { $env:PUSH_REPORTS_BRANCH } else { "main" }
$Skill  = "setup-push-reports"
$Dest   = Join-Path $env:USERPROFILE ".claude\skills"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
    Write-Host "Downloading $Skill from $Repo@$Branch..."
    $zip = Join-Path $tmp "skill.zip"
    Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/refs/heads/$Branch" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $src = Get-ChildItem -Path $tmp -Directory -Recurse -Filter $Skill | Select-Object -First 1
    if (-not $src) { throw "Could not find $Skill in the archive" }

    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    $target = Join-Path $Dest $Skill
    # Replace rather than merge: a stale template from an older version is
    # worse than a clean reinstall.
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Copy-Item -Path $src.FullName -Destination $target -Recurse

    Write-Host ""
    Write-Host "Installed to $target"
    Write-Host ""
    Write-Host "Next:"
    Write-Host "  1. gh auth login -s workflow     # the workflow scope is required"
    Write-Host "  2. Restart Claude Code"
    Write-Host "  3. In any repo:  /setup-push-reports <your-join-code>"
}
finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
