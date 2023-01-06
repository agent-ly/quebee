import type { QueueOptions } from "./option-interfaces.js";
import type { Job, JobQueue } from "./job-interfaces.js";

import { Base } from "./base.js";

export class Queue<TData = unknown> extends Base<TData> {
  constructor(
    public readonly name: string,
    private readonly options: QueueOptions
  ) {
    super(
      name,
      options.clientOptions.url,
      options.clientOptions.collectionName
    );
  }

  async start(): Promise<void> {
    const queue = await this.queuesCollection.countDocuments({
      name: this.name,
    });
    if (!queue) {
      await this.queuesCollection.insertOne({
        name: this.name,
        counter: 0,
        stalled: [],
        started: [],
        finished: [],
        failed: [],
        pending: [],
        locks: [],
        jobs: [],
      });
    }
  }

  async addJob(name: string, data?: TData): Promise<number> {
    const result = await this.queuesCollection.findOneAndUpdate(
      {
        name: this.name,
      },
      {
        $inc: { counter: 1 },
      },
      { returnDocument: "after" }
    );
    if (!result.value) throw new Error(`Queue ${this.name} not found`);
    const nextId = result.value.counter;
    const job = this.buildJob(nextId, name, data);
    return this.insertJob(job);
  }

  private async insertJob(job: Job<TData>): Promise<number> {
    await this.queuesCollection.updateOne(
      { name: this.name },
      { $push: { pending: job.id, jobs: job } }
    );
    return job.id;
  }

  private buildJob(id: number, name: string, data?: TData): Job<TData> {
    return {
      id,
      name,
      data: data ?? null,
      progress: null,
      started: null,
      finished: null,
      failed: null,
      error: null,
      created: new Date(),
      updated: new Date(),
    };
  }
}
