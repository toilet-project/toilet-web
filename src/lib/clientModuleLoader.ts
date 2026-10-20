// Share a browser chunk without putting its ready component behind a Suspense
// retry. Failed loads can be retried by a later mounted consumer.
export function createClientModuleLoader<T>(factory: () => Promise<T>) {
  let pending: Promise<T> | undefined
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(factory).catch(error => {
        pending = undefined
        throw error
      })
    }
    return pending
  }
}
