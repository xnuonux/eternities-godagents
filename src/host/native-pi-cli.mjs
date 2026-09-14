import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HELP = `Godagents native Pi operator

Usage:
  node src/host/native-pi-cli.mjs prepare --request <absolute-json> --pin <request-value-sha256> --output <new-config-json>
  node src/host/native-pi-cli.mjs <command> --config <absolute-file> --pin <sha256-hex> [--prompt-file <absolute-file>]
  node src/host/native-pi-cli.mjs history --config <absolute-file> --pin <sha256-hex> [--only settled|failed|incomplete] [--after <utc>] [--limit <n>]
  node src/host/native-pi-cli.mjs --help

Commands:
  prepare    Offline admission-to-config handoff. Does not read auth, load Pi,
             infer, create identity/session, or grant new effects. Never overwrites.
  preflight  Check admitted source, SDK, model and subscription without inference.
  launch     Create a fresh native session and run one prompt. Requires --prompt-file.
  resume     Continue the same actor/session and mission. Requires --prompt-file.
  review     Run/reconcile a pinned read-only host review. Requires a review
             config and --prompt-file. Repetition never starts a second review.
  status     Offline snapshot of recorded native state or failed setup.
  history    Offline recorded run history, including failed and incomplete attempts.
             Does not load credentials or create a model runtime.
             Optional filters: --only, --after, --limit. Not accepted on other commands.

Flags:
  --request      Prepare only. Reviewed preparation request, pinned by --pin.
  --output       Prepare only. Fresh absolute config file outside protected roots.
  --config       Absolute operator config JSON path. Required except prepare/--help.
  --pin          Independent SHA-256 of the parsed request (prepare) or config value,
                 computed with sha256Value, NOT the raw file-byte hash.
  --prompt-file  Absolute prompt path. Required for launch, resume and review.
                 Not accepted for preflight, status, or history.
  --only         History only. Exactly settled, failed, or incomplete.
                 settled selects stored native-turn-settled runs.
  --after        History only. Exact UTC timestamp YYYY-MM-DDTHH:mm:ss.sssZ.
                 Keeps runs whose startedAt is strictly later.
  --limit        History only. Canonical decimal integer 1..1000. Keeps the latest
                 matching runs after --only/--after. Not +1, 01, fractions, or exponents.

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
    const {parseNativeOperatorArgs,loadNativeOperatorConfig,loadNativePreparationRequest}=await import('./native-pi-operator-config.mjs');
    const args=parseNativeOperatorArgs(argv);
    if(args.command==='prepare') {
      const request=await loadNativePreparationRequest(args);
      const {prepareNativeOperator}=await import('./native-pi-operator.mjs');
      const result=await prepareNativeOperator({...args,request});
      stdout.write(JSON.stringify(result,null,2)+'\n');return 0;
    }
    const config=await loadNativeOperatorConfig(args);
    const {runNativeOperator}=await import('./native-pi-operator.mjs');
    let prompt;
    if(args.promptPath) {
      if((await stat(args.promptPath)).size>128*1024)throw new Error('native-operator:prompt');
      prompt=await readFile(args.promptPath,'utf8');
    }
    const result=await runNativeOperator({...args,config,prompt,signal,
      onProgress:event=>stderr.write(JSON.stringify(event)+'\n')});
    stdout.write(JSON.stringify(result,null,2)+'\n');return result.status==='failed'?1:result.status==='review-uncertain'?2:0;
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
