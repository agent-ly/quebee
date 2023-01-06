const clientOptions = {
  url: "mongodb://localhost:27017/test",
  collectionName: "quebee_jobs",
};

export const queueOptions = { clientOptions };

export const workerOptions = {
  concurrency: 2,
  drainDelay: 5e3,
  lockLifetime: 3e4,
  lockRenewal: 1.5e4,
  stalledInterval: 3e4,
  removeOnFinished: false,
  removeOnFailed: false,
  clientOptions,
};
