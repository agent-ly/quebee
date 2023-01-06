export type Job<TData = unknown> = {
  id: number;
  name: string;
  data: TData | null;
  progress: number | null;

  started: Date | null;
  finished: Date | null;
  failed: Date | null;
  error: string | null;

  created: Date;
  updated: Date;
};

export type LockedJob = { id: number; expires: Date };

export type JobQueue<TData = unknown> = {
  name: string;
  counter: number;

  pending: number[];
  stalled: number[];
  started: number[];
  finished: number[];
  failed: number[];

  locks: LockedJob[];
  jobs: Job<TData>[];
};
