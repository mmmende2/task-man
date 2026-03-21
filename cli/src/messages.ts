const MID_DAY_HIGH: string[] = [
  "You're on fire today, don't stop now!",
  "Look at that progress bar move!",
  "Keep this momentum going — you're crushing it!",
  "Unstoppable! Every task you finish fuels the next one.",
  "You're in the zone. Ride it out!",
];

const MID_DAY_LOW: string[] = [
  "Hang in there! Every task done is a win.",
  "One task at a time — you've got this.",
  "Keep going, you're making great progress!",
  "Slow and steady wins the race. You're doing great.",
  "Small steps add up. Keep pushing!",
];

const END_OF_DAY: string[] = [
  "Whew, what a day! Look at everything you got done.",
  "That's a wrap! You crushed it today.",
  "Another day, another set of wins. Time to recharge.",
  "Solid day of work. Tomorrow's you will thank today's you.",
  "You showed up and shipped. That's what counts.",
  "What a productive day — take a well-deserved break!",
  "Day done! Rest up, you earned it.",
  "Great hustle today. Now go do something fun.",
];

function randomFrom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getMidDayMessage(progressPercent: number): string {
  if (progressPercent >= 50) {
    return randomFrom(MID_DAY_HIGH);
  }
  return randomFrom(MID_DAY_LOW);
}

export function getEndOfDayMessage(): string {
  return randomFrom(END_OF_DAY);
}
