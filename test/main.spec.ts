import { Queue } from "../src/queue.js";
import { Worker } from "../src/worker.js";

import { delay } from "./util.js";
import { queueOptions, workerOptions } from "./fixtures.js";

const queue = new Queue("test", queueOptions);

const worker = new Worker("test", workerOptions, () => delay(5e3));

await queue.connect();

queue.on("job_added", (jobId) => console.log("job_added", jobId));
worker.on("job_started", (job) => console.log("job_started", job._id));
worker.on("job_finished", (job) => console.log("job_finished", job._id));

const addJobs = () => {
  for (let i = 0; i < 5; i++) queue.addJob();
};

addJobs();

setTimeout(addJobs, 30e3);

await worker.start();
