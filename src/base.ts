import { EventEmitter } from "events";
import type { Collection } from "mongodb";
import { MongoClient } from "mongodb";

import type { Job } from "./interfaces.js";

export type ClientOptions = {
  url: string;
  collectionName: string;
};

export class Base extends EventEmitter {
  private readonly client: MongoClient;
  private readonly collectionName: string;
  protected collection: Collection<Job>;

  constructor(options: ClientOptions) {
    super();
    this.client = new MongoClient(options.url);
    this.collectionName = options.collectionName;
  }

  protected async connectClient(): Promise<void> {
    await this.client.connect();
    this.collection = this.client.db().collection(this.collectionName);
    this.emit("client_connected");
  }

  protected async closeClient(): Promise<void> {
    await this.client.close();
    this.emit("client_closed");
  }
}
