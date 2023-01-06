import { Queue, QueueEvents, Worker } from "bullmq";
import { delay, batchDelay } from "./util.js";

const queue = new Queue("test");
const queueEvents = new QueueEvents("test");

const workerOptions = { autorun: false, concurrency: 2 };
const worker = new Worker("test", () => delay(5e3), workerOptions);

queueEvents.on("added", ({ jobId }) => console.log("job_added", jobId));
worker.on("active", (job) => console.log("job_started", job.id));
worker.on("completed", (job) => console.log("job_finished", job.id));
worker.on("drained", () => console.log("drained"));

await delay(1e3);

await queue.obliterate({ force: true });
queue.add("test", {});
queue.add("test", {}, { delay: 10e3 });
queue.add("test", {});
queue.add("test", {}, { delay: 5e3 });

await queue.close();

//await delay(1e3);

//batchDelay(5, 5, 10e3, () => queue.add("test", {}));

await worker.run();
