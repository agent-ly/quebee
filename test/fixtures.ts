const clientOptions = {
  url: "mongodb://localhost:27017/test",
  collectionName: "jobs",
};

export const queueOptions = { clientOptions };

export const workerOptions = {
  concurrency: 5,
  processInterval: 1e3,
  lockLifetime: 30e3,
  ignoreStartedJobs: true,
  clientOptions,
};
