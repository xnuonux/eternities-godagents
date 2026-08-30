export function recoverJournal(events) {
  if (!Array.isArray(events) || events.length === 0) throw new TypeError('events are required');
  const admitted = events.find((event) => event.type === 'mission.admitted');
  if (!admitted) return { status: 'idle', shouldInvoke: false };
  const missionEvents = events.filter((event) => event.requestId === admitted.requestId);
  const terminal = missionEvents.find((event) => event.type === 'mission.completed' || event.type === 'mission.failed');
  if (terminal) return { status: terminal.type === 'mission.completed' ? 'completed' : 'failed', shouldInvoke: false, requestId: admitted.requestId };
  const started = missionEvents.find((event) => event.type === 'host.invocation.started');
  if (started) return { status: 'retry', shouldInvoke: true, requestId: admitted.requestId };
  const bound = [...events].reverse().find((event) => event.type === 'godskills.bound');
  if (bound) return { status: 'resume-binding', shouldInvoke: false, requestId: admitted.requestId, packageDigest: bound.packageDigest };
  return { status: 'admitted', shouldInvoke: false, requestId: admitted.requestId };
}
