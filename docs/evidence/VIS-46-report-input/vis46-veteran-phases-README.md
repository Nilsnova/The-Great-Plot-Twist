# VIS46 veteran fixture timing diagnostic

Source candidate: `870e624b710112df8971b4e74ac3437c0772a51d`. Separate clone: `report-veteran-timing`.

This is one timestamp-only diagnostic, not a passing native input proof. The source difference adds 29 synchronous logging lines; the original 20-second test limit, high quality, all actions/assertions and 24 requested real frames remain unchanged. The diagnostic source hash is recorded in `vis46-veteran-phases-result.json`; its patch is preserved in the diagnostic clone.

Result: command exit 1; runner duration 23.09 seconds. The test exceeded the unchanged 20-second limit while waiting for the actual Close button click. The blocked 12-frame movement assertion completed; Close/post-Close ownership/released 12-frame movement assertions did not complete.

| Completed phase | Seconds since test entry |
|---|---:|
| test entered | 0.000 |
| harness callback | 0.481 |
| navigation complete | 0.792 |
| Play clicked | 1.014 |
| Create clicked | 6.057 |
| Start clicked | 12.308 |
| game ready no dialog | 12.938 |
| module importer ready | 13.590 |
| API setup done | 14.129 |
| campaign update ready | 14.609 |
| owners clear | 14.871 |
| wave emit complete | 15.088 |
| report opened | 15.502 |
| report active | 15.635 |
| initial position read | 16.108 |
| input held | 16.272 |
| blocked twelve frames and position pass | 19.008 |

API setup, including one paid cannon build and four upgrades, took about 0.539 seconds. The completed Play-to-Create interval took 5.043 seconds and Create-to-Start 6.251 seconds; this trace cannot distinguish element visibility/loading from pointer actionability waits within each interval. The blocked twelve-frame wait and position assertion took 2.735 seconds. No deadlock or additional input owner was observed before timeout, but post-Close movement remains unverified.

No application source, graphics settings, timeout or assertion was changed. Chrome closed and no live Chromium process remained after the run.
