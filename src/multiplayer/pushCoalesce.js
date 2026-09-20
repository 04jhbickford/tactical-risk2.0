// Serialize + coalesce authoritative pushes so a Done/pass write cannot
// disappear behind an in-flight place write. No Firebase here — SyncManager
// supplies runOnce(); harnesses supply a fake.

export function createPushQueue(runOnce) {
  let tail = Promise.resolve(false);
  let dirty = false;

  function enqueue() {
    dirty = true;
    const wait = tail.then(async (prev) => {
      if (!dirty) return prev;
      let result = prev;
      while (dirty) {
        dirty = false;
        result = await runOnce();
      }
      return result;
    });
    // Keep the latest write result on the tail so a Done waiter that
    // arrives mid-place still observes the coalesced post-Done outcome
    // (`() => false` here used to drop it and look like a failed pass).
    tail = wait.then((result) => result, () => false);
    return wait;
  }

  return {
    enqueue,
    hasPendingWork: () => dirty,
  };
}
