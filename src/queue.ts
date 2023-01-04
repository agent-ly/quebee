import type { Filter, WithId } from "mongodb";
import { ObjectId } from "mongodb";

import type { ClientOptions } from "./base.js";
import { Base } from "./base.js";
import { Job, JobStatus } from "./interfaces.js";

export type QueueOptions = {
  clientOptions: ClientOptions;
};

export class Queue<TData = null> extends Base {
  constructor(
    private readonly name: string,
    private readonly options: QueueOptions
  ) {
    super(options.clientOptions);
  }

  async start(): Promise<void> {
    await this.connectClient();
  }

  async stop(): Promise<void> {
    await this.closeClient();
  }

  async addJob(data: TData = null): Promise<ObjectId> {
    const job: Job<TData> = {
      name: this.name,
      data: data,
      locked: null,
      started: null,
      finished: null,
      failed: null,
      error: null,
      progress: null,
      created: new Date(),
      updated: new Date(),
    };
    const { insertedId: jobId } = await this.collection.insertOne(job as Job);
    this.emit("job_added", jobId);
    return jobId;
  }

  async addJobs(data: TData[]): Promise<ObjectId[]> {
    const jobs = data.map((data) => ({
      name: this.name,
      data: data,
      locked: null,
      started: null,
      finished: null,
      failed: null,
      error: null,
      progress: null,
      created: new Date(),
      updated: new Date(),
    }));
    const { insertedIds } = await this.collection.insertMany(jobs as Job[]);
    const jobIds = Object.values(insertedIds) as ObjectId[];
    for (const jobId of jobIds) this.emit("job_added", jobId as ObjectId);
    return jobIds;
  }

  findJob(filter: Filter<Job>): Promise<WithId<Job<TData>>[]> {
    return this.collection.find({ name: this.name, ...filter }).toArray();
  }

  findJobByStatus(status: JobStatus): Promise<WithId<Job<TData>>[]> {
    return this.findJob(this.getStatusFilter(status));
  }

  countJobsByStatus(status: JobStatus): Promise<number> {
    return this.collection.countDocuments({
      name: this.name,
      ...this.getStatusFilter(status),
    });
  }

  async removeJobsByStatus(
    status: "pending" | "finished" | "failed"
  ): Promise<number> {
    const { deletedCount } = await this.collection.deleteMany({
      name: this.name,
      ...this.getStatusFilter(status),
    });
    return deletedCount;
  }

  async findJobById(
    jobId: string | ObjectId
  ): Promise<WithId<Job<TData>> | null> {
    if (typeof jobId === "string") jobId = new ObjectId(jobId);
    const job = await this.collection.findOne({ _id: jobId, name: this.name });
    return job;
  }

  async removeJobById(jobId: string | ObjectId): Promise<void> {
    if (typeof jobId === "string") jobId = new ObjectId(jobId);
    const { deletedCount } = await this.collection.deleteOne({
      _id: jobId,
      started: null,
    });
    if (deletedCount === 0) throw new Error("Job not found or already started");
  }

  async getJobStatusById(jobId: string | ObjectId): Promise<JobStatus> {
    const job = await this.findJobById(jobId);
    if (!job) throw new Error("Job not found");
    if (job.failed) return "failed";
    if (job.finished) return "finished";
    if (job.started) return "started";
    return "pending";
  }

  private getStatusFilter(status: JobStatus) {
    switch (status) {
      case "pending":
        return { started: null };
      case "started":
        return { started: { $ne: null }, finished: null, failed: null };
      case "finished":
        return { finished: { $ne: null } };
      case "failed":
        return { failed: { $ne: null } };
    }
  }
}
