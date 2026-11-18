/**
 * One "refresh everything" switch. Every screen that loads data registers a refresher here
 * (see useLoad), so pulling down on any screen refreshes that screen AND the other screens
 * kept alive in the background (tabs, screens underneath), all at once.
 */
type Refresher = () => Promise<unknown> | void;

const refreshers = new Set<Refresher>();

export function registerRefresher(fn: Refresher): () => void {
  refreshers.add(fn);
  return () => {
    refreshers.delete(fn);
  };
}

export async function refreshAll(): Promise<void> {
  await Promise.allSettled([...refreshers].map((fn) => Promise.resolve(fn())));
}
