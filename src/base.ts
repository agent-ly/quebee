import { EventEmitter } from "events";
import type {
  Collection,
  IndexDescription,
  Filter,
  FindOneAndUpdateOptions,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
} from "mongodb";
import { MongoClient } from "mongodb";

import type { JobQueue } from "./job-interfaces.js";

const QUEUE_COLLECTION_INDEXES: IndexDescription[] = [
  { key: { name: 1 }, unique: true },
  { key: { name: 1, "jobs.id": 1 } },
  { key: { name: 1, "locks.id": 1 } },
];

export class Base<TData = unknown> extends EventEmitter {
  public readonly name: string;
  public readonly client: MongoClient;
  public readonly queuesCollection: Collection<JobQueue<TData>>;

  constructor(name: string, url: string, collectionName: string) {
    super();
    this.name = name;
    this.client = new MongoClient(url);
    this.queuesCollection = this.client.db().collection(collectionName);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.ensureIndexes();
    this.emit("connected");
  }

  async close(): Promise<void> {
    await this.client.close();
    this.emit("closed");
  }

  async ensureIndexes(): Promise<void> {
    await this.queuesCollection.dropIndexes();
    await this.queuesCollection.createIndexes(QUEUE_COLLECTION_INDEXES);
  }

  protected async getQueue(): Promise<JobQueue<TData>> {
    const queue = await this.queuesCollection.findOne({
      name: this.name,
    });
    if (!queue) throw new Error(`Queue ${this.name} not found`);
    return queue;
  }

  protected async updateQueue(
    update: UpdateFilter<JobQueue<TData>>,
    extraFilters: Filter<JobQueue<TData>> = {},
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    return this.queuesCollection.updateOne(
      { name: this.name, ...extraFilters },
      update,
      options
    );
  }

  protected async findAndUpdateQueue(
    update: UpdateFilter<JobQueue<TData>>,
    options: FindOneAndUpdateOptions,
    extraFilters?: Filter<JobQueue<TData>>
  ): Promise<JobQueue> {
    const result = await this.queuesCollection.findOneAndUpdate(
      { name: this.name, ...extraFilters },
      update,
      options
    );
    if (!result.value) throw new Error(`Queue ${this.name} not found`);
    return result.value;
  }
}
