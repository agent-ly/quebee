import type { Filter, UpdateFilter, UpdateResult, WithId } from "mongodb";

import type { Job } from "./interfaces.js";
import type { ClientOptions } from "./base.js";
import { Base } from "./base.js";

export type WorkerOptions = {
  concurrency: number;
  processInterval: number;
  lockLifetime: number;
  ignoreStartedJobs: boolean;
  clientOptions: ClientOptions;
};

export type ProcessorFunction<TData = null> = (
  job: WithId<Job<TData>>,
  progress: () => Promise<void>
) => Promise<void>;

export class Worker<TData = null> extends Base {
  private running = false;
  private stopping: Promise<void> | null = null;
  private processing: Set<Promise<WithId<Job> | null | void>> = new Set();

  constructor(
    private readonly name: string,
    private readonly options: WorkerOptions,
    private readonly processor: ProcessorFunction<TData>
  ) {
    super(options.clientOptions);
  }

  async start(): Promise<void> {
    await this.connect();
    await this.run();
  }

  stop(): Promise<void> {
    if (!this.stopping)
      this.stopping = new Promise(async (resolve) => {
        await Promise.all([...this.processing]);
        await this.close();
        resolve();
      });
    return this.stopping;
  }

  async run(): Promise<void> {
    if (this.running) throw new Error("Worker is already running");
    if (this.stopping) throw new Error("Worker is stopping");
    this.running = true;
    while (!this.stopping) {
      await this.process();
      await this.sleep();
    }
    this.running = false;
    return void Promise.all([...this.processing]);
  }

  async processJob(job: WithId<Job>): Promise<WithId<Job> | null> {
    if (job.next) job.next = null;
    job.started = new Date();
    job.updated = new Date();
    await this.saveJob(job);
    this.emit("job_started", job);

    const progress = () => this.progressJob(job);
    const done = async (error?: unknown): Promise<WithId<Job> | null> => {
      job.locked = null;
      if (error) {
        job.error = (error as Error).message;
        job.failed = new Date();
        job.updated = new Date();
      } else {
        job.finished = new Date();
        job.updated = new Date();
      }
      if (job.every) {
        if (error) job.fails = (job.fails ?? 0) + 1;
        else job.runs = (job.runs ?? 0) + 1;
        job.next = new Date(Date.now() + job.every);
        job.last = job.finished;
        job.started = null;
        job.finished = null;
      }
      await this.saveJob(job);
      error
        ? this.emit("job_failed", error, job)
        : this.emit("job_finished", job);
      return error ? null : this.getNextJob();
    };

    const promise = this.processor(job as WithId<Job<TData>>, progress)
      .then(() => done())
      .catch((error) => done(error));
    return promise;
  }

  async lockJob(job: WithId<Job>): Promise<boolean> {
    job.locked = new Date();
    job.updated = new Date();
    const { modifiedCount } = await this.saveJob(job, { locked: null });
    if (modifiedCount === 0) return false;
    return true;
  }

  async progressJob(job: WithId<Job>, progress?: number): Promise<void> {
    if (progress !== undefined) job.progress = progress;
    job.locked = new Date();
    job.updated = new Date();
    await this.saveJob(job);
    if (progress !== undefined) this.emit("job_progress", job);
  }

  async updateJobLocks(): Promise<void> {
    const threshold = new Date(Date.now() - this.options.lockLifetime);
    const filter: Filter<Job> = { locked: { $lt: threshold } };
    const update: UpdateFilter<Job> = {
      $set: { locked: null, updated: new Date() },
    };
    return void this.collection.updateMany(filter, update);
  }

  async getNextJob(): Promise<WithId<Job> | null> {
    if (this.stopping) return null;
    const filter: Filter<Job> = {
      name: this.name,
      locked: null,
      finished: null,
      failed: null,
    };
    if (this.options.ignoreStartedJobs) filter.started = null;
    const cursor = this.collection.find(filter).sort({ created: 1 });
    for await (const job of cursor) {
      if (job.next && job.next > new Date()) continue;
      return job;
    }
    return null;
  }

  private saveJob(
    job: WithId<Job>,
    extraFilters?: Filter<Job>
  ): Promise<UpdateResult> {
    return this.collection.updateOne(
      { _id: job._id, ...extraFilters },
      { $set: job }
    );
  }

  private async process(): Promise<void> {
    try {
      await this.updateJobLocks();
      if (this.processing.size < this.options.concurrency)
        this.processing.add(this.getNextJob());
      // We do this to get the reference to the promise that resolved
      // So we can later remove it from the set
      const promises = [...this.processing];
      const index = await Promise.race(
        promises.map((promise, i) => promise.then(() => i))
      );
      const promise = promises[index];
      this.processing.delete(promise);
      const job = await promise;
      if (!job) return;
      const locked = await this.lockJob(job);
      if (!locked) return;
      this.processing.add(this.processJob(job));
    } catch (error) {
      this.running = false;
      throw error;
    }
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, this.options.processInterval)
    );
  }
}
