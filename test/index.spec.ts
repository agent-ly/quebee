import { Queue } from "../src/queue.js";
import { Worker } from "../src/worker.js";

const clientOptions = {
  url: "mongodb://localhost:27017",
  collectionName: "jobs",
};

const queueOptions = { clientOptions };
const queue = new Queue("test", queueOptions);
queue.on("job_added", (jobId) => console.log("Job added", jobId));

const workerOptions = {
  concurrency: 1,
  processInterval: 1e3,
  lockLifetime: 30e3,
  ignoreStartedJobs: true,
  clientOptions,
};
const worker = new Worker(
  "test",
  workerOptions,
  () => new Promise<void>((resolve) => setTimeout(resolve, 5000))
);
worker.on("job_started", (job) => console.log("Job started", job));
worker.on("job_finished", (job) => console.log("Job finished", job));
worker.on("job_failed", (job) => console.log("Job failed", job));

await queue.start();

setInterval(() => queue.addJob(), 5e3);

await worker.start();
