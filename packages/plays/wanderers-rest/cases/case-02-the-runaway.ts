/**
 * Case 2: The Runaway
 *
 * A mysterious woman fleeing the Black Sun.
 * New characters, continuing storyline.
 */

import { registerCase, type CaseDefinition } from './index.js';

const CASE_02: CaseDefinition = {
  id: 'the-runaway',
  name: "The Runaway",
  tagline: "She came seeking sanctuary. The Black Sun followed.",
  description: `A woman named Sera arrived at the tavern a week ago, terrified and alone. She left a letter begging for help - and a black sun seal. Now she's missing. The same organization that killed Harren is hunting her. But why? And where did she go?`,
  unlockCondition: 'previous_solved',
  pointsToSolve: 10,

  npcs: [
    // Returning NPCs
    { id: 'maren', name: 'Maren', emoji: '🍺', role: 'The Barkeep', isNew: false },
    { id: 'kira', name: 'Kira', emoji: '📦', role: 'Traveling Merchant', isNew: false },
    { id: 'aldric', name: 'Aldric', emoji: '🔨', role: 'The Blacksmith', isNew: false },
    // New NPCs for this case
    { id: 'sera', name: 'Sera', emoji: '🌙', role: 'The Runaway', isNew: true, introduction: "She appeared a week ago, paid in strange gold, and vanished overnight." },
    { id: 'marcus', name: 'Marcus', emoji: '🎭', role: 'Traveling Actor', isNew: true, introduction: "He arrived the same night as Sera. Coincidence?" },
    { id: 'old_tom', name: 'Old Tom', emoji: '🪑', role: 'The Regular', isNew: true, introduction: "Been drinking here for decades. Sees everything, says little." },
  ],

  days: [
    // Day 1: Sera's disappearance
    {
      day: 1,
      digest: `You found Sera's letter this morning. The black sun seal made your blood run cold.

Maren read it over your shoulder.

🍺 *Maren*: "Another one. After all these years, another one."
You: "You knew her?"
🍺 *Maren*: "She was here a week. Paid well. Kept to herself. Cried at night."

A new guest arrived mid-morning. An actor named Marcus, with a theatrical bow.

🎭 *Marcus*: "I heard this tavern has... history. I'm collecting stories for my troupe."
🍺 *Maren*: "We don't have stories. Just drinks."
🎭 *Marcus*: "Everyone has stories, dear lady. Even the ones they don't want to tell."

Old Tom watched from his corner, nursing the same ale he's had for hours.`,
      statements: [
        { speakerId: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Sera left in the middle of the night. I heard the door.", isLie: false },
        { speakerId: 'marcus', speakerName: 'Marcus', speakerEmoji: '🎭', statement: "I've never seen anyone matching Sera's description. I just arrived today.", isLie: true },
        { speakerId: 'old_tom', speakerName: 'Old Tom', speakerEmoji: '🪑', statement: "Been coming here thirty years. Never seen that black sun before Harren died.", isLie: false },
      ],
      correctAnswer: 2,
      revelation: "Marcus claims he just arrived and never saw Sera. But how did he know she was missing? No one mentioned her name to him. He knows more than he's telling.",
    },

    // Day 2: Marcus's interest
    {
      day: 2,
      digest: `Marcus spent all day asking questions. Too many questions.

🎭 *Marcus*: "This Sera woman. What did she look like?"
🔨 *Aldric*: "Why do you care?"
🎭 *Marcus*: "Professional curiosity. I play many roles. I like to study faces."

Later, Kira pulled you aside.

📦 *Kira*: "That actor. I've seen him before."
You: "Where?"
📦 *Kira*: "Three towns back. He was asking about someone then too. A woman who'd fled. She turned up dead a week later."

Old Tom shuffled over.

🪑 *Old Tom*: "The actor came in the same night as Sera. Watched her the whole evening. She knew it too. That's why she ran."`,
      statements: [
        { speakerId: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "I've seen Marcus before. In another town, asking the same questions.", isLie: false },
        { speakerId: 'marcus', speakerName: 'Marcus', speakerEmoji: '🎭', statement: "This is my first time in this region. I'm from the capital.", isLie: true },
        { speakerId: 'old_tom', speakerName: 'Old Tom', speakerEmoji: '🪑', statement: "Sera left something behind. Under the floorboard in her room.", isLie: false },
      ],
      correctAnswer: 2,
      revelation: "Marcus claims this is his first time here, but Kira saw him three towns back. He's been following Sera. The question is: who sent him?",
    },

    // Day 3: What Sera left behind
    {
      day: 3,
      digest: `You checked Sera's old room. Old Tom was right - there was a loose floorboard.

Underneath: a journal. Sera's handwriting. Pages of fear and desperation.

One entry stood out:

*"They found me again. The man with the actor's smile. He's been following since Riverdale. I thought I could outrun them. I was wrong. If you're reading this, I'm already gone. Look for the lighthouse keeper. She knows where I'm really going."*

You showed it to Maren.

🍺 *Maren*: "Lighthouse keeper. That's old Mira. Lives on the cliff, three miles east."
📦 *Kira*: "I can take you there. I know the path."
🎭 *Marcus*: (from the doorway) "A lighthouse? How fascinating. I'd love to see it."

The room went cold.`,
      statements: [
        { speakerId: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "I saw Sera writing in that journal every night. She said it was her only truth.", isLie: false },
        { speakerId: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "The lighthouse keeper is a recluse. She doesn't trust strangers.", isLie: false },
        { speakerId: 'marcus', speakerName: 'Marcus', speakerEmoji: '🎭', statement: "I overheard you talking about the lighthouse. Pure coincidence I was nearby.", isLie: true },
      ],
      correctAnswer: 3,
      revelation: "Marcus 'happened' to overhear? He was listening at the door. He's been watching your every move, waiting for you to find the trail. He's not an actor - he's a hunter.",
    },
  ],

  resolution: `Marcus was never an actor. He was an agent of the Black Sun, sent to track down Sera.

She escaped them once before - she knew too much about their operations. Old Tom recognized the pattern: the same thing happened to his daughter years ago. That's why he drinks at Wanderer's Rest. To watch. To wait. To warn.

Kira helped you reach the lighthouse in time. Sera was there, ready to sail to the islands where the Black Sun can't follow. She escaped - this time for good.

Marcus disappeared the night you confronted him. But he left a message burned into the bar:

*"The debt is not yet paid."*

The Black Sun doesn't forget. But neither do you.`,

  nextCaseTeaser: `Weeks passed. The tavern returned to normal.

Then Old Tom didn't show up for his usual drink. One day. Two days. A week.

Aldric found him in his cottage. Alive, but barely. Someone had beaten him and left him for dead.

When he woke, he had only one word:

*"Daughter."*

Old Tom had a daughter once. She disappeared fifteen years ago. He never spoke of her.

Until now.`,
};

// Register this case
registerCase(CASE_02);

export default CASE_02;
