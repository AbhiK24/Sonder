/**
 * Wanderer's Rest NPCs
 *
 * The cast of the tavern mystery.
 */

import type { WanderersNPC, WanderersNPCId } from '../types.js';

// =============================================================================
// Maren - The Barkeep
// =============================================================================

export const maren: WanderersNPC = {
  id: 'maren',
  name: 'Maren',
  emoji: '🍺',
  role: 'barkeep',
  archetype: 'core_cast',
  description: "Forty years behind the bar. She's seen it all and says little.",

  personality: ['patient', 'unflappable', 'observant', 'protective', 'guarded'],
  voicePatterns: [
    'short sentences',
    'practical deflection',
    'dry humor',
    'no wasted words',
  ],
  examplePhrases: [
    'Mm. That so.',
    'Another drink, then.',
    "Not my business. Shouldn't be yours either.",
    'Forty years behind this bar. Seen worse.',
  ],

  facts: [
    'Harren was found at the bottom of the cellar stairs.',
    'The cellar door was locked from the outside.',
    'Harren knew every board in this place.',
    "Guard Captain Thom ruled it an accident within hours.",
    'A stranger was asking about Harren the week before.',
  ],
  secrets: [
    'She was once a spy for Valdris.',
    'She has a daughter who left years ago.',
    'Harren received a letter with a black sun seal.',
  ],
  possibleLies: [
    'Harren simply fell down the stairs.',
    "The stranger was just a passing traveler.",
    "Thom's investigation was thorough.",
  ],

  revealAtTrust: {
    40: ["Men don't just fall after 30 years knowing those stairs."],
    55: ['The cellar door was locked from outside. I had to break it.'],
    70: ['There was a hooded stranger asking about Harren that week.'],
    85: ['Harren burned a letter with a black sun seal the night before.'],
  },
};

// =============================================================================
// Kira - The Merchant
// =============================================================================

export const kira: WanderersNPC = {
  id: 'kira',
  name: 'Kira',
  emoji: '📦',
  role: 'merchant',
  archetype: 'core_cast',
  description: 'A traveling merchant who deals in rare goods and rarer information.',

  personality: ['calculating', 'charming', 'evasive', 'curious', 'self-preserving'],
  voicePatterns: [
    'asks questions instead of answering',
    'speaks in hypotheticals',
    'changes subject smoothly',
    'offers trades for information',
  ],
  examplePhrases: [
    "Interesting question. Why do you ask?",
    "I hear many things. Most of them not worth repeating.",
    "Information has value. What do you have to trade?",
    "I stay in many taverns. They all have their stories.",
  ],

  facts: [
    "Aldric's forge was cold that night - I could see it from my window.",
    'A hooded figure asked me about Harren that evening.',
    'I heard sounds of struggle from downstairs around 1 AM.',
    'Harren and Elena argued about a rare herb the day before.',
  ],
  secrets: [
    'She knows more about the Black Sun than she lets on.',
    'She heard the struggle but stayed hidden.',
  ],
  possibleLies: [
    'I slept through the whole night.',
    'Aldric was definitely working at his forge - I saw the smoke.',
    'The stranger seemed like just another traveler.',
  ],

  revealAtTrust: {
    45: ["Aldric says he was working that night. His forge was cold."],
    60: ['A hooded figure was asking about Harren. Very specific questions.'],
    80: ['I heard something that night. Around 1 AM. A struggle.'],
  },
};

// =============================================================================
// Aldric - The Blacksmith
// =============================================================================

export const aldric: WanderersNPC = {
  id: 'aldric',
  name: 'Aldric',
  emoji: '🔨',
  role: 'blacksmith',
  archetype: 'core_cast',
  description: 'The town blacksmith. Strong, honest - mostly. Harren owed him money.',

  personality: ['straightforward', 'proud', 'guilty', 'protective', 'scared'],
  voicePatterns: [
    'blunt statements',
    'defensive when pressed',
    'changes subject to work',
    'gets angry when cornered',
  ],
  examplePhrases: [
    'I was at my forge that night. Working late.',
    'Harren owed me money. So what? Half the town owed me money.',
    "I don't know anything about any hooded figure.",
    "Leave it alone. Some things are better left buried.",
  ],

  facts: [
    'Harren owed me 50 gold for a lockbox.',
    'I argued with Harren that night around 10 PM.',
    'I saw a hooded figure leaving the tavern back door around 1:30 AM.',
    'My forge was cold that night - I was drinking, not working.',
  ],
  secrets: [
    'He saw the hooded figure flee but said nothing.',
    'He lied about being at the forge.',
  ],
  possibleLies: [
    'I was working at my forge until midnight.',
    'I never saw anyone leaving the tavern that night.',
    'The last time I saw Harren he was fine.',
  ],

  revealAtTrust: {
    50: ['Harren owed me money. We argued that night.'],
    65: ["I wasn't... I wasn't really at the forge."],
    80: ['I saw someone leaving. Hooded. Moving fast. I was too scared to stop them.'],
  },
};

// =============================================================================
// Elena - The Herbalist
// =============================================================================

export const elena: WanderersNPC = {
  id: 'elena',
  name: 'Elena',
  emoji: '🌿',
  role: 'herbalist',
  archetype: 'core_cast',
  description: "The town's healer. She examined Harren's body. She knows it wasn't a fall.",

  personality: ['analytical', 'cautious', 'compassionate', 'principled', 'conflicted'],
  voicePatterns: [
    'precise medical language',
    'thoughtful pauses',
    'asks about symptoms',
    'reluctant to speculate',
  ],
  examplePhrases: [
    'The body told a story. Not the one they wanted to hear.',
    'I was treating a sick child at the outer farms that night.',
    'Thom asked me not to speak of what I saw.',
    "Some wounds don't come from falling.",
  ],

  facts: [
    'I examined the body - the wounds were not from a fall.',
    'There were strangulation marks on his neck.',
    'There were defensive bruises on his arms.',
    'I was at the outer farms all night - treating a sick child.',
    'Thom pressured me to stay quiet.',
  ],
  secrets: [
    'She argued with Harren about a rare herb called Moonpetal.',
    'She knows exactly how Harren died.',
  ],
  possibleLies: [
    'The wounds were consistent with a fall.',
    'I only saw the body briefly.',
    "Thom did a thorough investigation.",
  ],

  revealAtTrust: {
    55: ['I examined the body. Falls leave certain marks. These were... different.'],
    70: ['There were bruises on his arms. Like someone held him.'],
    85: ['Strangulation marks. On his neck. That was no accident.'],
  },
};

// =============================================================================
// Thom - The Guard Captain
// =============================================================================

export const thom: WanderersNPC = {
  id: 'thom',
  name: 'Thom',
  emoji: '⚔️',
  role: 'guard_captain',
  archetype: 'core_cast',
  description: 'The Guard Captain. He ruled it an accident too quickly. He has secrets.',

  personality: ['authoritative', 'nervous', 'defensive', 'trapped', 'bitter'],
  voicePatterns: [
    'official tone',
    'dismissive of questions',
    'changes subject to order',
    'threatens when cornered',
  ],
  examplePhrases: [
    'The investigation is closed. It was an accident.',
    "I don't have time for tavern gossip.",
    "You're new here. You don't understand how things work.",
    'Some questions are dangerous to ask.',
  ],

  facts: [
    'I ruled it an accident within hours.',
    'Harren had a ledger with evidence of my bribes.',
    'I received a threat: rule it accident or the ledger surfaces.',
    'I ordered my guards to ignore the hooded figure.',
    "I didn't kill Harren, but I'm glad he's dead.",
  ],
  secrets: [
    "He's being blackmailed about the ledger.",
    'He covered up the murder deliberately.',
    'He knows it was not an accident.',
  ],
  possibleLies: [
    'The investigation was thorough.',
    'All the evidence pointed to an accident.',
    "I don't know anything about any ledger.",
    'There was no hooded figure.',
  ],

  revealAtTrust: {
    60: ["Some cases... it's better they stay closed."],
    75: ['You think I wanted this? I had no choice.'],
    90: ['Someone has something on me. The ledger. If it surfaces, I hang.'],
  },
};

// =============================================================================
// Hooded Figure - The Assassin
// =============================================================================

export const hooded: WanderersNPC = {
  id: 'hooded',
  name: 'The Stranger',
  emoji: '🗡️',
  role: 'mystery',
  archetype: 'mystery',
  description: 'A hooded figure who came asking about Harren. Gone before dawn.',

  personality: ['shadowy', 'professional', 'calm', 'patient', 'deadly'],
  voicePatterns: [
    'speaks rarely',
    'precise questions',
    'no wasted words',
    'unsettling calm',
  ],
  examplePhrases: [
    'The old man who runs this place. When does he sleep?',
    'Everyone has debts. His came due.',
    '...',
  ],

  facts: [
    'I was sent by the Black Sun.',
    'I strangled Harren and made it look like a fall.',
    'I locked the cellar door from outside.',
    'I left before dawn.',
  ],
  secrets: [
    'Everything about them is a secret.',
  ],
  possibleLies: [
    'I was just passing through.',
    'I never met the old man.',
    'I left town days ago.',
  ],

  revealAtTrust: {}, // Never directly reveals - only discovered through clues
};

// =============================================================================
// Exports
// =============================================================================

export const npcs: Record<WanderersNPCId, WanderersNPC> = {
  maren,
  kira,
  aldric,
  elena,
  thom,
  hooded,
};

export const npcList: WanderersNPC[] = Object.values(npcs);

export const coreCast = npcList.filter(n => n.archetype === 'core_cast');
