// Recovery cancellation is a distinct action from logout. Do not leave the
// recovery screen until its server-side cancellation succeeds.
export function createRecoveryExit({ cancel, replace, home }: {
  cancel: () => Promise<void>; replace: (path: string) => void; home: string;
}) {
  let pending: Promise<void> | undefined
  return () => {
    pending ??= Promise.resolve().then(cancel).then(() => replace(home)).catch(error => {
      pending = undefined
      throw error
    })
    return pending
  }
}
