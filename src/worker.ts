import type { UpdateResult, WithId } from "mongodb";
import { nanoid } from "nanoid";

import type { Job } from "./job-interfaces.js";
import type { WorkerOptions } from "./option-interfaces.js";

import { Base } from "./base.js";
import { delay } from "./util.js";
import { Timers } from "./timers.js";

type JobOrNone = Job | null;

export type ProcessorFunction<TData = null> = (
  job: Job<TData>,
  progress: () => Promise<void>
) => Promise<void>;

export class Worker<TData = null> extends Base {
  private id = nanoid();
  private running = false;
  private drained = false;
  private waiting = false;
  private timers = new Timers();
  private stopping: Promise<void> | null = null;
  private processing: Map<Promise<JobOrNone>, string> = new Map();

  constructor(
    public readonly name: string,
    private readonly options: WorkerOptions,
    private readonly processor: ProcessorFunction<TData>
  ) {
    super(
      name,
      options.clientOptions.url,
      options.clientOptions.collectionName
    );
  }

  async start(): Promise<void> {
    await this.connect();
    await this.run();
  }

  stop(): Promise<void> {
    if (!this.stopping)
      this.stopping = new Promise(async (resolve) => {
        this.timers.clear();
        await Promise.all([...this.processing.keys()]);
        await this.close();
        resolve();
      });
    return this.stopping;
  }

  async run(): Promise<void> {
    if (this.running) throw new Error("Worker is already running");
    if (this.stopping) throw new Error("Worker is stopping");
    this.running = true;
    this.checkStalledJobs();
    let counter = 0;
    while (!this.stopping) {
      if (!this.waiting && this.processing.size < this.options.concurrency) {
        const token = `${this.id}-${counter++}`;
        this.processing.set(this.getNextJob(), token);
      }
      await this.process();
    }
    this.running = false;
    await Promise.all([...this.processing.keys()]);
  }

  // Job Functions

  private async processJob(
    job: Job,
    fetchNextCallback: () => boolean
  ): Promise<JobOrNone> {
    const locked = await this.lockJob(job);
    if (!locked) return null;
    let lockTimer: string;
    let isTimerStopped = false;
    const startRenewal = () => {
      lockTimer = this.timers.set(
        "renewJobLock",
        this.options.lockRenewal,
        async () => {
          try {
            if (isTimerStopped) return;
            if (!(await this.renewJobLock(job))) return;
            startRenewal();
          } catch (error) {
            console.error(`Error renewing lock for job ${job.id}: ${error}`);
          }
        }
      );
    };
    const stopRenewal = () => {
      isTimerStopped = true;
      this.timers.delete(lockTimer);
      this.unlockJob(job).catch((error) =>
        console.error(`Error unlocking job ${job.id}: ${error}`)
      );
    };

    const handleFinished = async () => {
      job.finished = new Date();
      job.updated = new Date();
      await this.updateQueue({ $pull: { started: job.id } });
      if (!this.options.removeOnFinished) {
        await this.updateQueue({ $push: { finished: job.id } });
        await this.saveJob(job);
      } else {
        await this.removeJob(job);
      }
      this.emit("finished", job);
      if (!fetchNextCallback()) return null;
      return this.findNextJob();
    };
    const handleFailed = async (error: unknown) => {
      job.error = (error as Error).message;
      job.failed = new Date();
      job.updated = new Date();
      await this.updateQueue({ $pull: { started: job.id } });
      if (!this.options.removeOnFailed) {
        await this.updateQueue({ $push: { failed: job.id } });
        await this.saveJob(job);
      } else {
        await this.removeJob(job);
      }
      this.emit("failed", error, job);
      return null;
    };

    try {
      job.started = new Date();
      job.updated = new Date();
      await this.saveJob(job);
      this.emit("started", job);
      startRenewal();
      const updateProgress = () => this.progressJob(job);
      await this.processor(job as WithId<Job<TData>>, updateProgress);
      return handleFinished();
    } catch (error) {
      return handleFailed(error);
    } finally {
      stopRenewal();
    }
  }

  private async lockJob(job: Job): Promise<boolean> {
    const lock = { id: job.id, expires: new Date() };
    const { modifiedCount } = await this.updateQueue(
      { $addToSet: { locks: lock } },
      { "locks.id": { $ne: job.id } }
    );
    return modifiedCount === 1;
  }

  private async unlockJob(job: Job): Promise<boolean> {
    const { modifiedCount } = await this.updateQueue(
      { $pull: { locks: { id: job.id } } },
      { "locks.id": job.id }
    );
    return modifiedCount === 1;
  }

  private async renewJobLock(job: Job): Promise<boolean> {
    const { modifiedCount } = await this.updateQueue(
      { $set: { "locks.$.expires": new Date() } },
      { "locks.id": job.id }
    );
    return modifiedCount === 1;
  }

  private async progressJob(job: Job, progress?: number): Promise<void> {
    if (progress !== undefined) job.progress = progress;
    job.updated = new Date();
    await this.saveJob(job);
    if (progress !== undefined) this.emit("progress", job);
  }

  private removeJob(job: Job): Promise<UpdateResult> {
    return this.updateQueue(
      { $pull: { "jobs.id": job.id } },
      { "jobs.id": job.id }
    );
  }

  private saveJob(job: Job): Promise<UpdateResult> {
    return this.updateQueue({ $set: { "jobs.$": job } }, { "jobs.id": job.id });
  }

  // Processor Functions

  private async process(): Promise<void> {
    const promises = [...this.processing.keys()];
    const index = await Promise.race(
      promises.map((promise, i) => promise.then(() => i))
    );
    const promise = promises[index];
    const job = await promise;
    if (job) {
      const token = this.processing.get(promise);
      if (!token) throw new Error(`Token not found for job ${job.id}`);
      this.processing.set(
        this.processJob(
          job,
          () => this.processing.size <= this.options.concurrency
        ),
        token
      );
    }
    this.processing.delete(promise);
  }

  private async getNextJob(): Promise<JobOrNone> {
    if (this.stopping) return null;
    if (this.drained) {
      this.waiting = true;
      await delay(this.options.drainDelay);
    }
    const job = await this.findNextJob();
    this.waiting = false;
    return job;
  }

  private async findNextJob(): Promise<JobOrNone> {
    const nextJobId = await this.findNextJobId();
    return this.findNextJobFromId(nextJobId ?? null);
  }

  // All the below functions could be possibly be improved

  private async findNextJobId(): Promise<number | null> {
    const queue = await this.findAndUpdateQueue(
      { $pop: { pending: -1 } },
      { returnDocument: "before" }
    );
    return queue.pending[0] ?? null;
  }

  private async findNextJobFromId(jobId: number | null): Promise<JobOrNone> {
    if (!jobId) {
      if (!this.drained) {
        this.drained = true;
        this.emit("drained", this.options.drainDelay);
      }
    } else {
      this.drained = false;
      const queue = await this.findAndUpdateQueue(
        { $addToSet: { started: jobId } },
        { returnDocument: "after" },
        { name: this.name, "jobs.id": jobId }
      );
      if (!queue.started.includes(jobId)) return null;
      const job = queue.jobs.find((job) => job.id === jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      return job;
    }
    return null;
  }

  private async checkStalledJobs(): Promise<void> {
    if (this.stopping) return;
    await this.requeueStalledJobs();
    this.timers.set("checkStalledJobs", this.options.stalledInterval, () =>
      this.checkStalledJobs()
    );
  }

  private async requeueStalledJobs(): Promise<void> {
    const queue = await this.findAndUpdateQueue(
      { $pull: { locks: { expires: { $lt: new Date() } } } },
      { returnDocument: "after" },
      { name: this.name, "locks.expires": { $lt: new Date() } }
    );
    const stalledStartedJobs = queue.started.filter(
      (jobId) => !queue.locks.some((lock) => lock.id === jobId)
    );
    if (stalledStartedJobs.length === 0) return;
    await this.updateQueue({
      $pull: { started: { $in: stalledStartedJobs } },
      $push: { waiting: { $each: stalledStartedJobs } },
    });
  }
}
