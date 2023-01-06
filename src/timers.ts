import { nanoid } from "nanoid";

type Timer = {
  name: string;
  timer: NodeJS.Timeout;
};

export class Timers {
  private readonly timers = new Map<string, Timer>();

  public set(name: string, delay: number, fn: () => Promise<void>) {
    const id = nanoid();
    const callback = async (timerId: string) => {
      this.timers.delete(timerId);
      try {
        await fn();
      } catch (e) {
        console.error(e);
      }
    };
    const timer = setTimeout(callback, delay, id);
    this.timers.set(id, { name, timer });
    return id;
  }

  public delete(id: string) {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer.timer);
    this.timers.delete(id);
  }

  public clear() {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer.timer);
      this.timers.delete(id);
    }
  }
}
