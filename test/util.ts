export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const batchDelay = (
  max: number,
  each: number,
  ms: number,
  callback: () => unknown
) => {
  for (let i = 0; i < max; i++) {
    let wait = ms * Math.floor(i / each);
    if (wait > 0) setTimeout(callback, wait);
    else callback();
  }
};
