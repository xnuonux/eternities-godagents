import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HELP = `Godagents native Pi operator

Usage:
  node src/host/native-pi-cli.mjs <command> --config <absolute-file> --pin <sha256-hex> [--prompt-file <absolute-file>]
  node src/host/native-pi-cli.mjs --help

Commands:
  preflight  Check admitted source, SDK, model and subscription without inference.
  launch     Create a fresh native session and run one prompt. Requires --prompt-file.
  resume     Continue the same actor/session and mission. Requires --prompt-file.
  status     Offline snapshot of recorded native state or failed setup.
  history    Offline recorded run history, including failed and incomplete attempts.
             Does not load credentials or create a model runtime.

Flags:
  --config       Absolute operator config JSON path. Required except --help.
  --pin          Independent SHA-256 of the parsed config's canonical JSON value,
                 computed with sha256Value, NOT the raw file-byte hash.
  --prompt-file  Absolute prompt path. Required for launch and resume only.
                 Not accepted for preflight, status, or history.

Authority:
  Native tools run as the OS user. This is not a sandbox or a guaranteed billing cap.
  status and history are observations, not proof of correctness or resume safety.
  Resume revalidates actor, lease, expiry, and native history. Failed setup remains
  preserved; choose a new sessionRoot and reviewed pin after correcting its cause.

--help reads no config, credentials or model runtime. See docs/native-pi-operator.md.
`;

function screened(error) {
  return /^(native-operator|native-pi|native-host|native-session-report|native-run-history):[a-z0-9-]{1,80}$/.test(error?.message ?? '')
    ? error.message : 'native-operator:operation-failed';
}

export async function nativePiCli(argv,{stdout=process.stdout,stderr=process.stderr,signal}={}) {
  try {
    if(Array.isArray(argv)&&argv.length===1&&argv[0]==='--help') {
      stdout.write(HELP);return 0;
    }
    const {parseNativeOperatorArgs,loadNativeOperatorConfig}=await import('./native-pi-operator-config.mjs');
    const args=parseNativeOperatorArgs(argv);
    const config=await loadNativeOperatorConfig(args);
    const {runNativeOperator}=await import('./native-pi-operator.mjs');
    let prompt;
    if(args.promptPath) {
      if((await stat(args.promptPath)).size>128*1024)throw new Error('native-operator:prompt');
      prompt=await readFile(args.promptPath,'utf8');
    }
    const result=await runNativeOperator({...args,config,prompt,signal,
      onProgress:event=>stderr.write(JSON.stringify(event)+'\n')});
    stdout.write(JSON.stringify(result,null,2)+'\n');return result.status==='failed'?1:0;
  } catch(error) {
    stderr.write(JSON.stringify({status:'failed',category:screened(error)})+'\n');return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const controller=new AbortController(),abort=()=>controller.abort();
  process.once('SIGINT',abort);process.once('SIGTERM',abort);
  try{process.exitCode=await nativePiCli(process.argv.slice(2),{signal:controller.signal});}
  finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
}
