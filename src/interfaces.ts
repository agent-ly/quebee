export type Job<TData = null> = {
  name: string;
  data: TData;
  locked: Date | null;
  started: Date | null;
  finished: Date | null;
  failed: Date | null;
  error: string | null;
  progress: number | null;
  created: Date;
  updated: Date;
};

export type JobStatus = "pending" | "started" | "finished" | "failed";
