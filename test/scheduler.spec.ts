import { Queue } from "../src/queue.js";
import { Worker } from "../src/worker.js";

import { delay } from "./util.js";
import { queueOptions, workerOptions } from "./fixtures.js";

const queue = new Queue("scheduler_test", queueOptions);

const worker = new Worker("scheduler_test", workerOptions, () => delay(5e3));

queue.on("job_added", (jobId) => console.log("job_added", jobId.toHexString()));
worker.on("job_started", (job) =>
  console.log("job_started", job._id.toHexString())
);
worker.on("job_finished", (job) =>
  console.log("job_finished", job._id.toHexString())
);

await queue.connect();

queue.scheduleJob(new Date(Date.now() + 1e4));
queue.scheduleJob(new Date(Date.now() + 2e4));
queue.scheduleJob(new Date(Date.now() + 3e4));

queue.repeatJob(5e3);

await worker.start();
