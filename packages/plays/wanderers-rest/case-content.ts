/**
 * Pre-built Case Content for "The Death of Old Harren"
 *
 * 15 days of consistent puzzles that reveal the mystery progressively.
 * Each day has a digest (what happened while away) and a puzzle.
 */

import type { WanderersNPCId } from './types.js';

export interface DayContent {
  day: number;
  digest: string;
  statements: Array<{
    speaker: WanderersNPCId;
    speakerName: string;
    speakerEmoji: string;
    statement: string;
    isLie: boolean;
  }>;
  correctAnswer: number; // 1, 2, or 3
  revelation: string; // What they learn if correct
}

export const CASE_CONTENT: DayContent[] = [
  // Day 1: Introduction - basic facts
  {
    day: 1,
    digest: `The tavern was quiet when you arrived. Maren wiped the same glass for ten minutes, watching you.

Aldric came in around midday. He ordered ale, sat in the corner.

🔨 *Aldric*: "New owner, eh? Good luck with that."
🍺 *Maren*: "Leave them be. They just got here."
🔨 *Aldric*: "I'm just saying. This place has history. Bad history."

He left an hour later. Didn't pay. Maren didn't ask him to.

Later, Kira arrived with her merchant's pack. She took the room upstairs - the same one she had *that* night.`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Harren knew every board in this place. Forty years he worked here.", isLie: false },
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "I was working at my forge all night when it happened. Ask anyone.", isLie: true },
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "I arrived the day before it happened. Just passing through.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Aldric claims he was at his forge... but he didn't pay for his drink. Maren let it slide. Why would she do that unless she knows something about where he really was?",
  },

  // Day 2: The quick ruling
  {
    day: 2,
    digest: `Guard Captain Thom came by today. First time since you arrived.

⚔️ *Thom*: "Just checking on the new owner. Making sure everything's... in order."
🍺 *Maren*: "Everything's fine, Captain."
⚔️ *Thom*: "Good. Good. No need to dig up old business, is there?"

He left without ordering anything. Maren's knuckles were white on the bar.

Later, Elena stopped by for herbs from the garden. She saw Thom leaving.

🌿 *Elena*: "He's been jumpy lately. Ever since..."
🍺 *Maren*: "Since Harren. Yes."
🌿 *Elena*: "Three weeks and he's still circling. What's he afraid of?"

Maren didn't answer. But she looked at you like she was deciding something.`,
    statements: [
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "The investigation was thorough. We examined every detail.", isLie: true },
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "I was treating a sick child at the outer farms that night.", isLie: false },
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "They ruled it an accident within hours. Hours.", isLie: false },
    ],
    correctAnswer: 1,
    revelation: "Thom said 'no need to dig up old business' - but a thorough investigation would have dug plenty. Maren said it was ruled an accident in *hours*. That's not thorough. That's a cover-up.",
  },

  // Day 3: The locked door
  {
    day: 3,
    digest: `Slow night. Just Maren, Kira, and the fire crackling.

Kira was writing in her ledger when she looked up suddenly.

📦 *Kira*: "That cellar door. Does it lock from inside or outside?"
🍺 *Maren*: "...Outside. Why?"
📦 *Kira*: "Just wondering. Old buildings have old locks."

Maren went quiet. Then, almost to herself:

🍺 *Maren*: "I had to break it. That morning. It was locked. From the outside."
📦 *Kira*: "Interesting."

Kira went back to her ledger. But her pen wasn't moving. She was listening.

You noticed: Kira's room is directly above the main hall. She would have heard everything that night.`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "The cellar door was locked from the outside when I found him.", isLie: false },
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "I slept soundly that whole night. Didn't hear a thing.", isLie: true },
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "Harren owed me money. Fifty gold for a lockbox.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Kira's room is right above the main hall. And she was very interested in that cellar door. She heard something that night - she just doesn't want to say what.",
  },

  // Day 4: The stranger
  {
    day: 4,
    digest: `Aldric was drinking heavily tonight. Kira watched him from across the room.

🔨 *Aldric*: "Another."
🍺 *Maren*: "You've had enough."
🔨 *Aldric*: "I'll say when I've had enough."

Thom walked in. Aldric went pale. Knocked over his drink trying to leave.

⚔️ *Thom*: "In a hurry, blacksmith?"
🔨 *Aldric*: "Just... just going home. Forge work tomorrow."

After he left:

📦 *Kira*: "He's scared of something."
⚔️ *Thom*: "People get nervous around guards. Means nothing."
📦 *Kira*: "Does it? I heard there was a stranger in town that week. Hooded. Asking questions."
⚔️ *Thom*: "Gossip."

But Thom's hand was shaking when he picked up his cup.`,
    statements: [
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "A hooded figure asked me about Harren that evening. Wanted to know his habits.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "There was no hooded stranger. Just tavern gossip.", isLie: true },
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Harren was nervous his last few days. Looking over his shoulder.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Thom called it gossip - but his hand was shaking. Kira SAW the stranger. Thom knows more than he's saying.",
  },

  // Day 5: The cold forge
  {
    day: 5,
    digest: `Kira cornered Aldric tonight. You pretended not to listen.

📦 *Kira*: "Your forge was cold that night."
🔨 *Aldric*: "What?"
📦 *Kira*: "I could see it from my window. No smoke. No fire. You weren't working."
🔨 *Aldric*: "You don't know what you saw."
📦 *Kira*: "I know exactly what I saw. The question is - what did YOU see?"

Aldric stormed out. Didn't even finish his drink.

Maren sighed.

🍺 *Maren*: "He's been like this since it happened. Drinking. Avoiding people."
📦 *Kira*: "Guilt does that to a person."
🍺 *Maren*: "Aldric didn't kill anyone."
📦 *Kira*: "No. But he saw something. And he's too scared to talk."`,
    statements: [
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "Aldric's forge was cold that night. I could see it from my window. No smoke.", isLie: false },
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "I never left my forge until midnight. The fire was burning bright.", isLie: true },
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "Harren and I argued the day before. About a rare herb he had.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Kira saw no smoke from Aldric's forge. He wasn't working that night - he was somewhere else. And whatever he saw there is eating him alive.",
  },

  // Day 6: Elena's examination
  {
    day: 6,
    digest: `Elena came for tea. She and Maren spoke in low voices by the fire.

🌿 *Elena*: "I can't stop thinking about it."
🍺 *Maren*: "Then stop thinking."
🌿 *Elena*: "You saw him too. You know what I know."
🍺 *Maren*: "What I know is that Thom told us to keep quiet."
🌿 *Elena*: "Since when do you take orders from Thom?"

Maren didn't answer.

🌿 *Elena*: "Those weren't fall wounds, Maren. I've seen falls. That wasn't a fall."
🍺 *Maren*: "I know."
🌿 *Elena*: "Then why—"
🍺 *Maren*: "Because whoever did this is still out there. And asking questions gets people killed."

They both looked at you. Then looked away.`,
    statements: [
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "I examined the body. The wounds... they weren't right for a fall.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "Elena confirmed it was an accident. She signed the report.", isLie: true },
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Elena told me privately what she really saw.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Elena examined the body. She KNOWS it wasn't a fall. But Thom made her sign something anyway. What kind of pressure makes a healer lie about a death?",
  },

  // Day 7: The defensive wounds
  {
    day: 7,
    digest: `A full week now. The regulars are warming to you.

Elena stayed late, helping you organize the herb cabinet Harren left behind.

🌿 *Elena*: "He had good taste. Harren. This moonpetal is rare."
You: "You knew him well?"
🌿 *Elena*: "Well enough. We argued, the day before. I wanted this moonpetal. He said no."
You: "Why?"
🌿 *Elena*: "He said it was 'too dangerous to give away.' I thought he meant the herb. Now I wonder if he meant something else."

Kira came down from her room.

📦 *Kira*: "Aldric was here earlier. Looking for you."
🌿 *Elena*: "Me? Why?"
📦 *Kira*: "Didn't say. But he was asking about wounds. What defensive wounds look like."

Elena went very still.`,
    statements: [
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "There were bruises on his arms. Defensive wounds. Someone held him.", isLie: false },
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "I saw Harren that night. He was perfectly calm. Not a care.", isLie: true },
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "Harren owed Aldric money. They argued that evening.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Aldric is asking about defensive wounds - which means he saw something that night. And his claim that Harren was 'calm'? Harren was terrified. Aldric is lying to protect himself.",
  },

  // Day 8: What Aldric really saw
  {
    day: 8,
    digest: `Aldric came in late. Alone. He sat in the darkest corner and didn't order anything.

At closing time, everyone else had left. He was still there.

🔨 *Aldric*: "I need to tell someone."
🍺 *Maren*: "Then tell."
🔨 *Aldric*: "That night. I wasn't at the forge. I was... I was walking home. Drunk. Took the back way, past the tavern."
🍺 *Maren*: "And?"
🔨 *Aldric*: "I saw someone. Coming out the back door. Moving fast. Hooded."

Maren set down her glass.

🍺 *Maren*: "What time?"
🔨 *Aldric*: "Past one. Maybe half past. I should have done something. But I was scared. I just... hid. And watched them go."

He was crying. Maren poured him a drink on the house.`,
    statements: [
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "I saw someone leaving the tavern back door. Around 1:30 in the morning. Hooded.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "My guards patrol all night. No one could have left unseen.", isLie: true },
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "I found the body at dawn. I had to break the cellar door.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Aldric SAW the killer leave. At 1:30 AM. And Thom's guards supposedly patrol all night? Either they're incompetent or they were told to look the other way.",
  },

  // Day 9: The letter
  {
    day: 9,
    digest: `Maren asked you to stay after closing. She had something to show you.

She led you to the fireplace. Pointed at the stones around it.

🍺 *Maren*: "See that black mark? That's where he burned it."
You: "Burned what?"
🍺 *Maren*: "The letter. Came the day before he died. He read it once and threw it in the fire. Didn't even finish his dinner."

She knelt by the hearth.

🍺 *Maren*: "I saw the seal before it burned. A black sun. Never seen anything like it."
You: "Did you ask him about it?"
🍺 *Maren*: "I asked. He said 'Some debts can't be paid with money, Maren.' Then he went to bed. I never saw him alive again."

She stood up. Her eyes were wet.

🍺 *Maren*: "Forty years. And I couldn't protect him from whatever that letter meant."`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Harren received a letter the day before. He burned it immediately.", isLie: false },
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "I never saw any letter. Harren seemed fine to me.", isLie: true },
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "Thom pressured me to stay quiet about what I found.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Kira says she never saw any letter, but she sees EVERYTHING. She was watching that night. She knows about the letter - she just doesn't want to reveal how much she knows.",
  },

  // Day 10: The black sun seal
  {
    day: 10,
    digest: `You've been here ten days now. The tavern feels different. Like the walls are holding their breath.

After closing, Maren locked the door and sat across from you.

🍺 *Maren*: "You've earned this. What I'm about to tell you doesn't leave this room."

She took a deep breath.

🍺 *Maren*: "The black sun. I've seen that seal before. Once. Thirty years ago. A man came to the tavern looking for someone. He had papers with that seal. The next day, that someone was dead."

You: "Who was it?"
🍺 *Maren*: "Doesn't matter now. What matters is: that seal means someone's time is up. And Harren knew it when he saw it. That's why he burned the letter. He knew what was coming."

Aldric nodded slowly from his corner. You hadn't noticed him there.

🔨 *Aldric*: "The hooded figure. The one I saw. They moved like... like killing was nothing to them."`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "The letter had a black sun seal. Harren went pale when he saw it.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "I've never heard of any black sun. Sounds like tavern fantasy.", isLie: true },
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "I was too scared to confront the hooded figure. I just hid.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Thom dismisses it as fantasy - but Maren has SEEN that seal before. Thirty years ago. Same result: death. The Black Sun is real. And Thom knows it.",
  },

  // Day 11: Kira's knowledge
  {
    day: 11,
    digest: `Kira asked to speak with you privately. She took you to her room upstairs.

📦 *Kira*: "I trade in more than goods. I trade in information. And I've heard things, in other towns, about a black sun."

She pulled out a worn journal.

📦 *Kira*: "They're old. Very old. They don't forgive debts. They don't forget grudges. If Harren crossed them decades ago... they'd still come collecting."

You: "Do they have a name?"
📦 *Kira*: "People call them the Black Sun. But that's all anyone knows. They're shadows. They show up, someone dies, they vanish."

She closed the journal.

📦 *Kira*: "Whatever Harren did in his past, it caught up with him. And Thom knows more than he's saying. He shut down the investigation too fast. Almost like he was warned."`,
    statements: [
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "The Black Sun. I've heard whispers in other towns. They collect old debts.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "I had nothing to do with the cover-up. I just followed procedure.", isLie: true },
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "There were strangulation marks. On his neck. Hidden under his collar.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Thom 'followed procedure'? Since when is ruling a murder as an accident in hours standard procedure? He helped cover it up. The question is: was he paid, threatened, or both?",
  },

  // Day 12: The ledger
  {
    day: 12,
    digest: `Thom came to the tavern tonight. Maren refused to serve him.

🍺 *Maren*: "Get out."
⚔️ *Thom*: "Maren. Be reasonable."
🍺 *Maren*: "You buried him before his body was cold. You called it an accident. You told Elena to sign papers she shouldn't have signed. Now get out of my tavern."

Thom leaned in, voice low.

⚔️ *Thom*: "You don't know what you're dealing with."
🍺 *Maren*: "I know exactly what I'm dealing with. A coward with a badge."
⚔️ *Thom*: "There's a ledger, Maren. Harren kept records. And whoever has it now... they're the ones you should be afraid of. Not me."

He left. Maren was shaking.

📦 *Kira*: (from the corner) "A ledger. Interesting. What kind of records?"

Maren didn't answer. But she looked at the loose floorboard behind the bar.`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Harren kept records. A ledger. It went missing after he died.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "I don't know anything about any ledger.", isLie: true },
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "Around 1 AM that night, I heard sounds of struggle. Then silence.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Thom JUST mentioned the ledger to Maren - then claims he doesn't know anything about it? The ledger has something on him. That's why he helped cover up the murder.",
  },

  // Day 13: Thom's secret
  {
    day: 13,
    digest: `Thom came back. Drunk this time. Alone.

He sat in the corner Aldric usually claims. Maren served him without a word.

After his third drink:

⚔️ *Thom*: "You think I wanted this? You think I had a choice?"

No one answered. He kept talking anyway.

⚔️ *Thom*: "That morning. After they found Harren. A message was waiting at my door. 'Rule it an accident. Or we publish the ledger.' That's it. No signature. Just a black sun seal."

🍺 *Maren*: "What's in that ledger, Thom?"

He laughed. Bitter.

⚔️ *Thom*: "Everything. Every bribe I ever took. Every case I buried. Harren knew it all. He never threatened me. He just... knew. And now someone else knows."

He finished his drink and stumbled out. Aldric watched him go.

🔨 *Aldric*: "He's not a killer. He's just a coward. Like me."`,
    statements: [
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "Someone sent me a message that morning. Rule it accident, or else.", isLie: false },
      { speaker: 'aldric', speakerName: 'Aldric', speakerEmoji: '🔨', statement: "Thom had nothing to do with any of this. He's an honest man.", isLie: true },
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "Thom ordered the body buried quickly. No proper examination.", isLie: false },
    ],
    correctAnswer: 2,
    revelation: "Aldric calls Thom 'honest' - but we just heard Thom confess to taking bribes for years. Aldric is protecting him. Maybe because he's scared. Maybe because they're both trapped.",
  },

  // Day 14: The full picture
  {
    day: 14,
    digest: `The pieces are falling into place. Tonight, everyone gathered. Even Elena, who rarely stays late.

🍺 *Maren*: "Harren left the tavern to a stranger. Not to me. Not to anyone in town. Why?"
📦 *Kira*: "Because he knew they'd come for whoever owned this place next."
🌿 *Elena*: "The Black Sun?"
📦 *Kira*: "They sent a warning. The letter. Then an assassin. But Harren didn't run. He made sure whoever came after him would be protected by distance. By anonymity."

She looked at you.

📦 *Kira*: "You. You're not connected to any of this. Whatever debt Harren owed, it died with him. You're safe."

🔨 *Aldric*: "But why? Why did they want him dead after all these years?"
📦 *Kira*: "Does it matter? The Black Sun doesn't explain. They just collect."

Maren poured everyone a drink.

🍺 *Maren*: "To Harren. Who protected us even in death."`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Harren left the tavern to a stranger to protect whoever inherited it.", isLie: false },
      { speaker: 'kira', speakerName: 'Kira', speakerEmoji: '📦', statement: "The Black Sun sends warnings before they act. The letter was his death sentence.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "I covered it up because I wanted Harren dead.", isLie: true },
    ],
    correctAnswer: 3,
    revelation: "Thom didn't want Harren dead - he was being BLACKMAILED. The Black Sun had leverage on him through that ledger. He's not a murderer. He's a pawn.",
  },

  // Day 15: The truth
  {
    day: 15,
    digest: `Your final night of investigating. Tomorrow, you can choose: let it rest, or keep digging.

Maren sat with you after everyone left.

🍺 *Maren*: "You know the truth now. Or most of it."
You: "Tell me the rest."
🍺 *Maren*: "Harren crossed the Black Sun forty years ago. I don't know how. He never said. But he spent his whole life waiting for them to come collecting."

She stared at the fire.

🍺 *Maren*: "The hooded stranger. The assassin. They came, did their work, and vanished. Thom covered it up because they had his secrets. Aldric saw it happen and said nothing because he was afraid. Kira heard the struggle and stayed hidden because that's how you survive."

🍺 *Maren*: "And me? I found him the next morning. My oldest friend. Dead at the bottom of stairs he walked a thousand times. And I couldn't do anything but bury him and keep the tavern running."

She looked at you.

🍺 *Maren*: "You're the new owner now. Harren chose you for a reason. Maybe because you're not from here. Maybe because you'll do what we couldn't."

*What will you do with the truth?*`,
    statements: [
      { speaker: 'maren', speakerName: 'Maren', speakerEmoji: '🍺', statement: "Harren crossed the Black Sun decades ago. They finally came to collect.", isLie: false },
      { speaker: 'elena', speakerName: 'Elena', speakerEmoji: '🌿', statement: "It was murder. Strangulation, made to look like a fall.", isLie: false },
      { speaker: 'thom', speakerName: 'Thom', speakerEmoji: '⚔️', statement: "The hooded stranger was just a passing traveler. Coincidence.", isLie: true },
    ],
    correctAnswer: 3,
    revelation: "The stranger was an assassin from the Black Sun. Aldric SAW them leave. Kira HEARD the struggle. Elena found the strangulation marks. And Thom - still lying to the very end - wants you to believe it was coincidence. The truth is clear now: Harren was murdered for a debt forty years old. And everyone in this tavern knows it.",
  },
];

/**
 * Get content for a specific day
 */
export function getDayContent(day: number): DayContent | null {
  // Clamp to available days, cycling if needed
  const index = ((day - 1) % CASE_CONTENT.length);
  return CASE_CONTENT[index] || null;
}

/**
 * Get the welcome message for new players
 */
export const WELCOME_MESSAGE = `🍺 *Welcome to Wanderer's Rest*

You've inherited this tavern from a man named Harren.
They say he fell down the cellar stairs.

The regulars aren't so sure.

*The cast:*
🍺 Maren — The barkeep. Forty years here.
📦 Kira — Traveling merchant. Sees everything.
🔨 Aldric — Blacksmith. Owes debts. Owed debts.
🌿 Elena — Herbalist. She examined the body.
⚔️ Thom — Guard Captain. Closed the case fast.

Each day, you'll hear what happened while you were away.
Then you'll face a puzzle: *three statements, one lie.*

Find the lies. Solve the mystery.
Get 10 points to crack the case.

---

`;

/**
 * Message shown after solving today's puzzle
 */
export function getPostPuzzleMessage(correct: boolean, points: number, total: number, targetPoints: number): string {
  const percent = Math.round((total / targetPoints) * 100);
  const bar = '▓'.repeat(Math.round(percent / 10)) + '░'.repeat(10 - Math.round(percent / 10));

  if (correct) {
    return `
*Progress:* ${total}/${targetPoints} points
${bar} ${percent}%

Come back tomorrow for the next puzzle.
The tavern will remember you.`;
  } else {
    return `
*Progress:* ${total}/${targetPoints} points
${bar} ${percent}%

No points this time, but you can try again tomorrow.
The truth is still waiting.`;
  }
}

/**
 * Case resolution - shown when player reaches 10 points
 */
export const CASE_RESOLUTION = `The truth is finally clear.

Harren was murdered by an assassin from the Black Sun - a shadowy organization he crossed forty years ago. The hooded stranger came to collect an old debt. They strangled Harren in the cellar and locked the door from outside.

Guard Captain Thom covered it up because he was being blackmailed - Harren's ledger contained records of his bribes. Aldric saw the killer flee but was too scared to speak. Kira heard the struggle but stayed hidden. Elena knew the wounds weren't from a fall but was pressured to sign false reports.

Harren left the tavern to you - a stranger - to protect whoever inherited it from becoming the next target.

The Black Sun got what they came for. But you've uncovered the truth. Harren can rest now.`;

/**
 * Teaser for the next case - shown after resolution
 */
export const NEXT_CASE_TEASER = `---

*But the tavern's secrets run deeper...*

A week after you solved Harren's case, a stranger arrived at the tavern. She asked for a room and paid in gold coins you've never seen before.

That night, you heard her crying through the walls.

The next morning, she was gone. But she left something behind: a letter addressed to "The New Owner of Wanderer's Rest."

Inside, a single line: *"They're coming for me next. Please. Find out why before it's too late."*

And a black sun seal.

---

*Case 2: The Runaway - Coming Soon*

The Black Sun doesn't forget. And neither does Wanderer's Rest.`;

/**
 * Get the full case solved message
 */
export function getCaseSolvedMessage(): string {
  return `🎉 *CASE SOLVED: The Death of Old Harren*

${CASE_RESOLUTION}

${NEXT_CASE_TEASER}`;
}
