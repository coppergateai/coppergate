type ContenderRun = {
  taskId: string;
  taskTitle: string;
};

type ContenderView = {
  id: string;
  latestRun: ContenderRun | null;
};

type ProjectLane = {
  contenders: ContenderView[];
};

/** Majority `latestRun.taskId` across the lane roster (hot tournament). */
export function resolveLaneTaskId(lane: ProjectLane): string | null {
  const counts = new Map<string, number>();
  for (const c of lane.contenders) {
    const id = c.latestRun?.taskId;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

export function resolveLaneTaskTitle(
  lane: ProjectLane,
  taskId: string | null,
  displayTitle: (raw: string, max: number) => string,
): string | null {
  if (!taskId) return null;
  for (const c of lane.contenders) {
    if (c.latestRun?.taskId === taskId) {
      const title = displayTitle(c.latestRun.taskTitle, 72);
      return title || null;
    }
  }
  return null;
}
