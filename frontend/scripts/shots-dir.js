// Where a check or capture script writes its screenshots and reports when no folder is given: a folder
// under the system's temp directory, so the script runs on any computer and leaves the repository clean.
// (Four scripts used to default to one teammate's home folder and stopped with EACCES everywhere else.)
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export const defaultShotsDir = name => join(tmpdir(), 'plot-twist-shots', name);
