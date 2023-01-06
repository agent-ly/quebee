export type ClientOptions = { url: string; collectionName: string };

export type QueueOptions = { clientOptions: ClientOptions };

export type WorkerOptions = {
  concurrency: number;
  drainDelay: number;
  lockLifetime: number;
  lockRenewal: number;
  stalledInterval: number;
  removeOnFinished: boolean;
  removeOnFailed: boolean;
  clientOptions: ClientOptions;
};
