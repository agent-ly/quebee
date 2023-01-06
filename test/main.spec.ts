import { Queue } from "../src/queue.js";
import { Worker } from "../src/worker.js";

import { delay, batchDelay } from "./util.js";
import { queueOptions, workerOptions } from "./fixtures.js";

const queue = new Queue("test", queueOptions);

const worker = new Worker("test", workerOptions, () => delay(5e3));

await queue.connect();
await queue.queuesCollection.deleteMany({});
await queue.start();

worker.on("drained", (delay) => console.log(`drained, waiting ${delay}ms`));
queue.on("added", (jobId) => console.log("job_added", jobId));
worker.on("started", (job) => console.log("job_started", job.id));
worker.on("finished", (job) => console.log("job_finished", job.id));

//await queue.addJob("test");
//await queue.addJob("test");
//await queue.addJob("test");

await worker.start();
