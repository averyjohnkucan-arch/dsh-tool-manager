// Explicit searches must not silently omit slow providers or use the automatic
// suggestion preference to exclude skills. Scope and invocation policy still apply.
export async function discoverSkills(service, options = {}) {
  if (!service) return [];
  const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(15000)]);
  const snapshot = typeof service.snapshot === 'function'
    ? await service.snapshot({...options, signal})
    : {skills: await service.list({...options, signal}), complete: true};
  signal.throwIfAborted();
  if (!snapshot.complete) throw Error('Skill discovery is incomplete. Retry the search; no tools were selected.');
  return snapshot.skills.filter(s => s.invocation.modelInvocable);
}

export const choiceStatus = (names, skills) => {
  const chosen = [...names.filter(name => name !== 'skill' || !skills.length), ...skills];
  return chosen.length ? `Model chose ${chosen.join(', ')}` : 'Model chose no additional tools or skills';
};
