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
  "You showed up. That's the hardest part.",
  "Some days are for thinking, not finishing.",
  "Progress isn't always visible. Trust the process.",
  "You're here. That counts.",
  "Not every hour needs to be productive.",
  "Rest is part of the work.",
  "The day isn't over yet.",
  "Small moves. Big picture.",
  "Just being in the arena matters.",
  "Your pace is your pace.",
  "Today is today. That's enough.",
  "Still here, still going. That's the whole game.",
  "You don't have to earn the right to rest.",
  "Showing up is a skill. You have it.",
  "What you did today mattered, even if it doesn't feel like it.",
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
