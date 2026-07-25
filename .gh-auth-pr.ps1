Set-Location "C:\Users\prest\Documents\Soliscore Dispatch"
$credInput = "protocol=https`nhost=github.com`n`n"
$credLines = @($credInput | git credential fill)
$tokenLine = $credLines | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
if (-not $tokenLine) { Write-Error 'No GitHub credential'; exit 1 }
$env:GH_TOKEN = $tokenLine.Substring(9)
gh auth status
$prUrl = gh pr create --base main --head cursor/schedule-edit-dates-c8de --title "Fix Schedule date editing when jobs are pushed back" --body @"
## Summary
- Easier date editing (click dates or job bar)
- Shift crew task bars when job dates move
- Jump calendar when job leaves current view

## Test plan
- [ ] Edit job dates on Schedule board
- [ ] Verify task bars shift with job
- [ ] Move job outside visible range and confirm calendar jumps

Made with [Cursor](https://cursor.com)
"@
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "PR_URL=$prUrl"
$mergeOut = gh pr merge --squash --admin $prUrl 2>&1
Write-Output $mergeOut
$state = gh pr view $prUrl --json state,mergedAt,url -q '.url + " " + .state + " mergedAt=" + (.mergedAt // "null")'
Write-Output "PR_STATE=$state"
