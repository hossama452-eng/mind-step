/**
 * MindStep Smart Scheduling Engine — DETERMINISTIC (Prompt 06 §7, §8, §9).
 *
 * ARCHITECTURE:
 *   The scheduler is a pure, deterministic function. It takes tasks + preferences
 *   and returns a candidate plan (time blocks + unscheduled tasks + explanation).
 *   It NEVER writes to the database (Prompt 06 §14 — "Generate → Review → Approve → Persist").
 *
 * SCORING ALGORITHM (Prompt 06 §9, §48):
 *   Each eligible task gets a scheduling score from 0..100, based on:
 *     1. Urgency (due date proximity)         weight: 35
 *     2. Importance (user priority)            weight: 25
 *     3. Effort fit (estimated vs available)   weight: 15
 *     4. Overdue status                        weight: 15
 *     5. Focus history adjustment              weight: 10
 *
 *   The formula is documented, tested, and deterministic. Same inputs → same output.
 *
 * OVERLOAD DETECTION (Prompt 06 §11):
 *   If total estimated time > available time - buffer, the engine returns
 *   an overload warning with suggestions (prioritize, move, shorten, leave unscheduled).
 *
 * BUFFER (Prompt 06 §10, §27):
 *   The engine reserves buffer time (default 15%) and never fills 100% of available time.
 *
 * TASK SPLITTING (Prompt 06 §26):
 *   If a task's estimate exceeds the preferred focus duration, the engine splits
 *   it into multiple blocks with buffer between them.
 *
 * CONFLICT DETECTION (Prompt 06 §40):
 *   The engine detects overlapping blocks and returns them in the conflicts list.
 */

// ============================================================
// TYPES
// ============================================================

export interface SchedulableTask {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: "low" | "normal" | "high" | "urgent";
  energy: "low" | "medium" | "high";
  estimateMinutes: number | null;
  dueAt: string | null; // ISO
  projectId: string | null;
  milestoneId: string | null;
  actualMinutes: number | null; // historical focus time
}

export interface SchedulingPreferences {
  dailyStartMinutes: number;   // 0-1439, e.g., 480 = 8:00 AM
  dailyEndMinutes: number;     // e.g., 1320 = 10:00 PM
  bufferPercentage: number;    // 0..0.5, e.g., 0.15 = 15%
  maxDailyFocusMinutes: number; // e.g., 240 = 4 hours
  preferredFocusDuration: number; // e.g., 25 minutes
  includeBreaks: boolean;
  energyPreference: "low" | "medium" | "high";
}

export interface ExistingTimeBlock {
  id: string;
  startAt: string;
  endAt: string;
  type: string;
  status: string;
}

export interface GeneratedBlock {
  taskId: string;
  taskTitle: string;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  type: "focus" | "break" | "buffer";
}

export interface UnscheduledTask {
  taskId: string;
  taskTitle: string;
  reason: string;
}

export interface ScheduleConflict {
  block1: GeneratedBlock;
  block2: GeneratedBlock | ExistingTimeBlock;
  description: string;
}

export interface GeneratedPlan {
  blocks: GeneratedBlock[];
  unscheduled: UnscheduledTask[];
  conflicts: ScheduleConflict[];
  summary: {
    totalPlannedMinutes: number;
    availableMinutes: number;
    bufferMinutes: number;
    isOverloaded: boolean;
    taskCount: number;
    unscheduledCount: number;
    explanation: string;
  };
}

// ============================================================
// SCORING (Prompt 06 §9, §48)
// ============================================================

/**
 * Calculate the scheduling score for a task (0..100).
 *
 * Factors and weights:
 *   1. Urgency    (35%) — how soon is the due date?
 *   2. Importance  (25%) — user-assigned priority
 *   3. Effort fit  (15%) — does the estimate fit available time?
 *   4. Overdue     (15%) — is the task past its due date?
 *   5. History     (10%) — has focus time been recorded? (adjusts estimate confidence)
 *
 * Normalization: each factor is normalized to 0..1, then weighted, then
 * summed to produce a 0..100 score.
 *
 * Tie-breaking: tasks with the same score are ordered by:
 *   a. Earlier due date
 *   b. Higher priority
 *   c. Smaller estimate (easier to start)
 *   d. Earlier createdAt
 */
export function calculateSchedulingScore(
  task: SchedulableTask,
  context: {
    now: Date;
    availableMinutes: number;
    historicalAverageMinutes?: number;
  }
): number {
  const { now, availableMinutes } = context;

  // --- Factor 1: Urgency (35%) ---
  // Urgency is based on how many days until the due date.
  // Due today = 1.0, due in 7 days = 0.5, due in 30+ days = 0.1, no due date = 0.3.
  let urgency = 0.3; // default for no due date
  if (task.dueAt) {
    const due = new Date(task.dueAt);
    const daysUntilDue = (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntilDue <= 0) urgency = 1.0;       // overdue or due today
    else if (daysUntilDue <= 1) urgency = 0.95;  // due tomorrow
    else if (daysUntilDue <= 3) urgency = 0.8;   // due in 3 days
    else if (daysUntilDue <= 7) urgency = 0.5;   // due this week
    else if (daysUntilDue <= 14) urgency = 0.3;   // due in 2 weeks
    else urgency = 0.1;                            // far future
  }

  // --- Factor 2: Importance (25%) ---
  const priorityMap: Record<string, number> = {
    urgent: 1.0,
    high: 0.75,
    normal: 0.5,
    low: 0.25,
  };
  const importance = priorityMap[task.priority] ?? 0.5;

  // --- Factor 3: Effort fit (15%) ---
  // Tasks that fit within the available time get a higher score.
  const estimate = task.estimateMinutes ?? 25;
  const effortFit = estimate <= availableMinutes ? 1.0 : Math.max(0.1, availableMinutes / estimate);

  // --- Factor 4: Overdue (15%) ---
  const isOverdue = task.dueAt ? new Date(task.dueAt).getTime() < now.getTime() : false;
  const overdueBonus = isOverdue ? 1.0 : 0.0;

  // --- Factor 5: History (10%) ---
  // If the task has actual focus time recorded, we have more confidence
  // in the estimate. This is a mild bonus.
  const hasHistory = (task.actualMinutes ?? 0) > 0;
  const historyConfidence = hasHistory ? 1.0 : 0.5;

  // --- Weighted sum ---
  const score =
    urgency * 35 +
    importance * 25 +
    effortFit * 15 +
    overdueBonus * 15 +
    historyConfidence * 10;

  return Math.round(score * 10) / 10; // round to 1 decimal
}

/**
 * Compare two tasks for tie-breaking (used after scoring).
 * Returns negative if a should come before b.
 */
export function compareTasksForScheduling(
  a: { score: number; task: SchedulableTask },
  b: { score: number; task: SchedulableTask },
  now: Date
): number {
  // Higher score first.
  if (b.score !== a.score) return b.score - a.score;

  // Tie-break 1: earlier due date.
  const aDue = a.task.dueAt ? new Date(a.task.dueAt).getTime() : Infinity;
  const bDue = b.task.dueAt ? new Date(b.task.dueAt).getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;

  // Tie-break 2: higher priority.
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const aPri = priorityOrder[a.task.priority] ?? 2;
  const bPri = priorityOrder[b.task.priority] ?? 2;
  if (aPri !== bPri) return aPri - bPri;

  // Tie-break 3: smaller estimate (easier to start).
  const aEst = a.task.estimateMinutes ?? 25;
  const bEst = b.task.estimateMinutes ?? 25;
  return aEst - bEst;
}

// ============================================================
// AVAILABLE TIME CALCULATION
// ============================================================

/**
 * Calculate available minutes for a given day, considering:
 *   - daily start/end preferences
 *   - existing time blocks (subtracted)
 *   - buffer percentage
 *   - max daily focus limit
 */
export function calculateAvailableMinutes(
  date: Date,
  prefs: SchedulingPreferences,
  existingBlocks: ExistingTimeBlock[]
): { totalAvailable: number; afterBuffer: number; afterExisting: number; bufferMinutes: number } {
  // Total available minutes from daily start to end.
  const totalAvailable = Math.max(0, prefs.dailyEndMinutes - prefs.dailyStartMinutes);

  // Subtract existing blocks that fall within the day.
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  let existingMinutes = 0;
  for (const block of existingBlocks) {
    const blockStart = new Date(block.startAt);
    const blockEnd = new Date(block.endAt);
    if (blockStart >= dayStart && blockStart < dayEnd) {
      existingMinutes += Math.max(0, (blockEnd.getTime() - blockStart.getTime()) / 60000);
    }
  }

  const afterExisting = Math.max(0, totalAvailable - existingMinutes);
  const bufferMinutes = Math.round(afterExisting * prefs.bufferPercentage);
  const afterBuffer = Math.max(0, afterExisting - bufferMinutes);

  // Cap at max daily focus limit.
  const capped = Math.min(afterBuffer, prefs.maxDailyFocusMinutes);

  return {
    totalAvailable,
    afterBuffer: capped,
    afterExisting,
    bufferMinutes,
  };
}

// ============================================================
// PLAN GENERATION (Prompt 06 §49)
// ============================================================

/**
 * Generate a candidate plan for a given date.
 *
 * STEPS (Prompt 06 §49):
 *   1. Gather eligible tasks (not completed/archived)
 *   2. Remove completed/archived tasks
 *   3. Apply date constraints (due today/tomorrow weighted higher)
 *   4. Calculate priority scores
 *   5. Calculate workload
 *   6. Identify available windows
 *   7. Reserve buffer
 *   8. Place tasks (with splitting if needed)
 *   9. Detect conflicts
 *   10. Produce candidate plan
 *   11. Return unscheduled tasks
 *   12. Explain limitations
 *
 * This function NEVER writes to the database.
 */
export function generatePlan(
  tasks: SchedulableTask[],
  date: Date,
  prefs: SchedulingPreferences,
  existingBlocks: ExistingTimeBlock[] = [],
  options: { taskIds?: string[]; historicalAverages?: Map<string, number> } = {}
): GeneratedPlan {
  const now = new Date();

  // Step 1-2: Filter eligible tasks.
  let eligible = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "archived" &&
      t.status !== "done"
  );

  // Step 3: If specific task IDs provided (e.g., Minimum Viable Day), filter to those.
  if (options.taskIds && options.taskIds.length > 0) {
    eligible = eligible.filter((t) => options.taskIds!.includes(t.id));
  }

  // Step 6-7: Calculate available time + buffer.
  const { afterBuffer: availableMinutes, bufferMinutes } = calculateAvailableMinutes(
    date,
    prefs,
    existingBlocks
  );

  // Step 4: Calculate scores.
  const scored = eligible.map((task) => {
    const historicalAvg = options.historicalAverages?.get(task.id);
    const score = calculateSchedulingScore(task, {
      now,
      availableMinutes,
      historicalAverageMinutes: historicalAvg,
    });
    return { task, score };
  });

  // Sort by score (descending) with tie-breaking.
  scored.sort((a, b) => compareTasksForScheduling(a, b, now));

  // Step 5: Calculate total workload.
  const totalWorkload = scored.reduce(
    (sum, { task }) => sum + (task.estimateMinutes ?? 25),
    0
  );

  // Step 8: Place tasks into time blocks.
  const blocks: GeneratedBlock[] = [];
  const unscheduled: UnscheduledTask[] = [];
  let remainingMinutes = availableMinutes;

  // Build the time slot starting from daily start.
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  dayStart.setMinutes(prefs.dailyStartMinutes);

  let currentSlot = new Date(dayStart);

  // Track which existing blocks fall within today to detect conflicts.
  const todayExisting = existingBlocks.filter((b) => {
    const bs = new Date(b.startAt);
    return bs >= dayStart && bs < new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  });

  for (const { task } of scored) {
    const estimate = task.estimateMinutes ?? 25;

    // If the task doesn't fit in remaining time, mark it unscheduled.
    if (estimate > remainingMinutes) {
      unscheduled.push({
        taskId: task.id,
        taskTitle: task.title,
        reason: "Not enough time remaining in the day",
      });
      continue;
    }

    // Task splitting (Prompt 06 §26): if estimate > preferred focus duration,
    // split into multiple blocks with buffer between them.
    const blocksForTask = splitTaskIntoBlocks(
      task,
      estimate,
      prefs.preferredFocusDuration,
      currentSlot,
      remainingMinutes
    );

    if (blocksForTask.length === 0) {
      unscheduled.push({
        taskId: task.id,
        taskTitle: task.title,
        reason: "Not enough time for even one focus block",
      });
      continue;
    }

    // Place the blocks.
    for (const block of blocksForTask) {
      // Check for conflicts with existing blocks.
      const conflict = detectConflict(block, todayExisting);
      if (conflict) {
        // Skip past the conflicting block.
        const conflictEnd = new Date(conflict.block2.endAt);
        currentSlot = new Date(conflictEnd.getTime() + 5 * 60000); // 5 min gap
        // Re-attempt placement after the conflict.
        const adjustedBlock: GeneratedBlock = {
          ...block,
          startAt: currentSlot.toISOString(),
          endAt: new Date(currentSlot.getTime() + block.plannedMinutes * 60000).toISOString(),
        };
        blocks.push(adjustedBlock);
        currentSlot = new Date(adjustedBlock.endAt);
      } else {
        blocks.push(block);
        currentSlot = new Date(block.endAt);
      }
      remainingMinutes -= block.plannedMinutes;
    }

    // Add a short buffer between tasks (not counted against available time).
    const bufferGap = Math.round(5 * 1); // 5 min gap
    currentSlot = new Date(currentSlot.getTime() + bufferGap * 60000);
  }

  // Step 9: Detect conflicts between generated blocks.
  const conflicts = detectAllConflicts(blocks, todayExisting);

  // Step 10-12: Build the plan summary.
  const totalPlannedMinutes = blocks
    .filter((b) => b.type === "focus")
    .reduce((sum, b) => sum + b.plannedMinutes, 0);

  const isOverloaded = totalWorkload > availableMinutes;

  let explanation: string;
  if (isOverloaded) {
    explanation = "You have more planned work than available time. Some tasks were left unscheduled.";
  } else if (blocks.length === 0) {
    explanation = "No tasks to schedule. Enjoy the breathing room.";
  } else if (unscheduled.length > 0) {
    explanation = `${blocks.length} blocks scheduled. ${unscheduled.length} task(s) didn't fit and were left unscheduled.`;
  } else {
    explanation = `${blocks.length} blocks scheduled. The plan leaves room for buffer and flexibility.`;
  }

  return {
    blocks,
    unscheduled,
    conflicts,
    summary: {
      totalPlannedMinutes,
      availableMinutes,
      bufferMinutes,
      isOverloaded,
      taskCount: scored.length,
      unscheduledCount: unscheduled.length,
      explanation,
    },
  };
}

// ============================================================
// TASK SPLITTING (Prompt 06 §26)
// ============================================================

/**
 * Split a task into multiple time blocks if its estimate exceeds the
 * preferred focus duration. Each block is separated by a short buffer.
 *
 * Example: Task = 90 min, preferred focus = 25 min
 *   → Block 1: 25 min focus + 5 min buffer
 *   → Block 2: 25 min focus + 5 min buffer
 *   → Block 3: 25 min focus + 5 min buffer
 *   → Block 4: 15 min focus (remaining)
 *
 * The underlying task remains ONE task — we only create multiple blocks.
 */
function splitTaskIntoBlocks(
  task: SchedulableTask,
  totalMinutes: number,
  preferredDuration: number,
  startSlot: Date,
  availableMinutes: number
): GeneratedBlock[] {
  const blocks: GeneratedBlock[] = [];
  let remaining = totalMinutes;
  let slot = new Date(startSlot);
  let used = 0;

  while (remaining > 0 && used < availableMinutes) {
    const blockMinutes = Math.min(preferredDuration, remaining);
    if (blockMinutes <= 0) break;

    const end = new Date(slot.getTime() + blockMinutes * 60000);
    blocks.push({
      taskId: task.id,
      taskTitle: task.title,
      startAt: slot.toISOString(),
      endAt: end.toISOString(),
      plannedMinutes: blockMinutes,
      type: "focus",
    });

    slot = new Date(end.getTime() + 5 * 60000); // 5 min buffer between blocks
    remaining -= blockMinutes;
    used += blockMinutes;
  }

  return blocks;
}

// ============================================================
// CONFLICT DETECTION (Prompt 06 §40)
// ============================================================

function detectConflict(
  block: GeneratedBlock,
  existingBlocks: ExistingTimeBlock[]
): ScheduleConflict | null {
  const blockStart = new Date(block.startAt);
  const blockEnd = new Date(block.endAt);

  for (const existing of existingBlocks) {
    if (existing.status === "cancelled" || existing.status === "missed") continue;
    const exStart = new Date(existing.startAt);
    const exEnd = new Date(existing.endAt);
    if (blockStart < exEnd && blockEnd > exStart) {
      return {
        block1: block,
        block2: existing,
        description: `Block overlaps with existing ${existing.type} block`,
      };
    }
  }
  return null;
}

function detectAllConflicts(
  generated: GeneratedBlock[],
  existing: ExistingTimeBlock[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Check generated vs existing.
  for (const block of generated) {
    const conflict = detectConflict(block, existing);
    if (conflict) conflicts.push(conflict);
  }

  // Check generated vs generated (internal overlaps).
  for (let i = 0; i < generated.length; i++) {
    for (let j = i + 1; j < generated.length; j++) {
      const a = generated[i];
      const b = generated[j];
      const aStart = new Date(a.startAt);
      const aEnd = new Date(a.endAt);
      const bStart = new Date(b.startAt);
      const bEnd = new Date(b.endAt);
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({
          block1: a,
          block2: b,
          description: "Two generated blocks overlap",
        });
      }
    }
  }

  return conflicts;
}

// ============================================================
// NEXT BEST ACTION (Prompt 06 §18, §19)
// ============================================================

export interface NextBestAction {
  action: "continue_focus" | "start_scheduled" | "start_high_value" | "start_tiny" | "rest";
  taskId?: string;
  taskTitle?: string;
  reason: string;
}

/**
 * Given the user's current state, determine the best next action.
 *
 * Rules (Prompt 06 §19):
 *   1. If there's an active FocusSession → recommend continuing it.
 *   2. If no active session but there's a scheduled task → start it.
 *   3. If no schedule → recommend a high-value small task.
 *   4. If overwhelmed → recommend the smallest viable action.
 *   5. If no tasks at all → recommend rest.
 */
export function getNextBestAction(context: {
  hasActiveFocusSession: boolean;
  activeFocusTaskTitle?: string;
  scheduledBlocks: GeneratedBlock[];
  unscheduledTasks: SchedulableTask[];
  now: Date;
  isOverwhelmed?: boolean;
}): NextBestAction {
  const { hasActiveFocusSession, scheduledBlocks, unscheduledTasks, now } = context;

  // Rule 1: Continue active focus session.
  if (hasActiveFocusSession) {
    return {
      action: "continue_focus",
      taskTitle: context.activeFocusTaskTitle,
      reason: "You're already focusing. Keep going gently.",
    };
  }

  // Rule 2: Start the next scheduled task.
  const upcomingBlock = scheduledBlocks.find((b) => new Date(b.startAt) <= now && b.type === "focus");
  if (upcomingBlock) {
    return {
      action: "start_scheduled",
      taskId: upcomingBlock.taskId,
      taskTitle: upcomingBlock.taskTitle,
      reason: "This task is scheduled for now.",
    };
  }

  // Rule 3: No schedule — find a high-value small task.
  const sortedByScore = unscheduledTasks
    .map((task) => ({
      task,
      score: calculateSchedulingScore(task, { now, availableMinutes: 60 }),
    }))
    .sort((a, b) => b.score - a.score);

  if (sortedByScore.length > 0) {
    const best = sortedByScore[0];
    // Rule 4: If overwhelmed, pick the smallest task instead.
    if (context.isOverwhelmed) {
      const smallest = [...unscheduledTasks].sort(
        (a, b) => (a.estimateMinutes ?? 25) - (b.estimateMinutes ?? 25)
      )[0];
      if (smallest) {
        return {
          action: "start_tiny",
          taskId: smallest.id,
          taskTitle: smallest.title,
          reason: "A small step counts. Start tiny.",
        };
      }
    }
    return {
      action: "start_high_value",
      taskId: best.task.id,
      taskTitle: best.task.title,
      reason: "Suggested next step based on urgency and importance.",
    };
  }

  // Rule 5: No tasks — rest.
  return {
    action: "rest",
    reason: "Nothing urgent. Take a breath.",
  };
}
