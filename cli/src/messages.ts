const MID_DAY_HIGH: string[] = [
  "You're on fire today, don't stop now!",
  "Look at that progress bar move!",
  "Keep this momentum going -- you're crushing it!",
  "Unstoppable. Every task you finish fuels the next one.",
  "You're in the zone. Ride it out!",
  "Solid execution. The finish line is in sight.",
  "Shipping machine. Keep it rolling.",
  "Clear eyes, full lists, can't lose.",
  "Your future self is already grateful.",
  "Nothing can stop you when you're locked in like this.",
  "Task after task -- this is what flow state looks like.",
  "You've built serious momentum. Don't let up now.",
  "The hard part is behind you. Coast home.",
  "Peak performance. This is your day.",
  "You came here to ship, and ship you shall.",
];

const MID_DAY_LOW: string[] = [
  "Hang in there. Every task done is a win.",
  "One task at a time -- you've got this.",
  "Progress is progress, no matter the pace.",
  "Slow and steady wins the race. You're doing great.",
  "Small steps add up. Keep pushing!",
  "The hardest part is starting. You already did that.",
  "Focus on the next task, not the whole list.",
  "Even one completed task moves the needle.",
  "Momentum builds. Knock out the next one.",
  "You don't have to finish everything -- just keep going.",
  "Every expert was once a beginner. Every pro was once stuck.",
  "The list looks long, but you're longer.",
  "Brick by brick. You're building something.",
  "Don't count the tasks. Make the tasks count.",
  "Start anywhere. Finish something. Repeat.",
];

const END_OF_DAY: string[] = [
  "What a day. Look at everything you got done.",
  "That's a wrap. You crushed it today.",
  "Another day, another set of wins. Time to recharge.",
  "Solid day of work. Tomorrow's you will thank today's you.",
  "You showed up and shipped. That's what counts.",
  "What a productive day -- take a well-deserved break.",
  "Day done. Rest up, you earned it.",
  "Great hustle today. Now go do something fun.",
  "Logged off. Tasks handled. Well done.",
  "Today's diff: +progress, -stress. Ship it.",
  "You moved things forward. That's all that matters.",
  "Good work compounds. Today was an investment.",
];

/** Pick a message deterministically based on the current date. */
function dailyPick(pool: string[]): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return pool[dayOfYear % pool.length];
}

export function getMidDayMessage(progressPercent: number): string {
  if (progressPercent >= 50) {
    return dailyPick(MID_DAY_HIGH);
  }
  return dailyPick(MID_DAY_LOW);
}

export function getEndOfDayMessage(): string {
  return dailyPick(END_OF_DAY);
}
