export type JobStatus = "pending" | "started" | "finished" | "failed";

export type Job<TData = unknown> = {
  name: string;
  data: TData | null;
  progress: number | null;
  locked: Date | null;
  started: Date | null;
  finished: Date | null;
  failed: Date | null;
  error: string | null;
  created: Date;
  updated: Date;
};
