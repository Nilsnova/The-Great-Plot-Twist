// Private source identity for the exact local serving process, without credentials.
import {loadRuntime} from './runtime.mjs';
import {recordServingSource} from './source.mjs';
const runtime=await loadRuntime(process.argv[2]);
const processId=Number(process.argv[4]);
if(!Number.isSafeInteger(processId)||processId<1)throw Error('A real local process ID is required');
recordServingSource(runtime,process.argv[3],processId);
