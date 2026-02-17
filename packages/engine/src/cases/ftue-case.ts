/**
 * FTUE Case: The Previous Owner's Death
 *
 * The first case every player encounters.
 * Maren reveals details as trust builds, introducing other NPCs.
 * Spans days 1-7, teaches player how the game works.
 */

import { Case, Clue, Suspect, FTUEProgress } from './types.js';

// NPCs introduced during FTUE
export const FTUE_NPCS = {
  // Townspeople - always around
  aldric: {
    id: 'aldric',
    name: 'Aldric',
    role: 'Blacksmith',
    category: 'townspeople',
    intro: 'The blacksmith. He was the last to see Old Harren alive.',
  },
  elena: {
    id: 'elena',
    name: 'Elena',
    role: 'Herbalist',
    category: 'townspeople',
    intro: 'The herbalist who lives at the edge of town. She treated Harren\'s wounds.',
  },
  thom: {
    id: 'thom',
    name: 'Thom',
    role: 'Guard Captain',
    category: 'townspeople',
    intro: 'The guard captain. He ruled it an accident. Quickly. Too quickly, some say.',
  },

  // Visitors - come and go
  // (Kira already exists)

  // Strangers - appeared around the time of death
  hooded: {
    id: 'hooded',
    name: 'The Hooded Figure',
    role: 'Unknown',
    category: 'stranger',
    intro: 'A stranger in a dark cloak. Seen the night Harren died. Never identified.',
  },
};

// The case itself
export const FTUE_CASE: Case = {
  id: 'ftue_harren_death',
  title: 'The Death of Old Harren',
  hook: 'You\'ve inherited this tavern from a man named Harren. They say he fell down the cellar stairs. But Maren\'s eyes tell a different story.',
  description: 'Old Harren, the previous owner of Wanderer\'s Rest, died three weeks ago. The official ruling was an accident - a fall down the cellar stairs. But whispers persist. Harren was careful. Harren knew those stairs. Something doesn\'t add up.',
  severity: 'major',
  status: 'active',
  availableDay: 1,

  victim: 'harren',

  suspects: [
    {
      npcId: 'aldric',
      motive: 'Harren owed him money. A lot of money. The debt died with Harren.',
      alibi: 'Claims he was at the forge all night. The fire was burning, but no one saw him there.',
      isGuilty: false,
      suspicionLevel: 0,
    },
    {
      npcId: 'thom',
      motive: 'Harren knew something about Thom. Something that could end his career.',
      alibi: 'Was on patrol. Multiple witnesses... all guards under his command.',
      isGuilty: false,
      suspicionLevel: 0,
    },
    {
      npcId: 'hooded',
      motive: 'Unknown. But strangers don\'t arrive for no reason.',
      alibi: 'None. Vanished after that night.',
      isGuilty: true,  // The actual killer - but WHO is the hooded figure?
      suspicionLevel: 0,
    },
    {
      npcId: 'elena',
      motive: 'Harren refused to sell her a rare ingredient he kept locked away.',
      alibi: 'Was treating a sick child in the outer farms. The family confirms.',
      isGuilty: false,
      suspicionLevel: 0,
    },
  ],

  clues: [
    // Day 1-2: Basic setup from Maren
    {
      id: 'clue_accident',
      content: 'Harren "fell" down the cellar stairs three weeks ago. Maren found him.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 35 },
      revealed: false,
      pointsTo: 'truth',
    },
    {
      id: 'clue_maren_doubt',
      content: 'Maren doesn\'t believe it was an accident. "Harren knew every creaky board in this place."',
      source: 'maren',
      revealCondition: { type: 'trust', value: 40 },
      revealed: false,
      pointsTo: 'truth',
    },

    // Day 2-3: Aldric introduction
    {
      id: 'clue_aldric_debt',
      content: 'The blacksmith, Aldric, was owed a significant sum by Harren. The debt was never repaid.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 45 },
      revealed: false,
      pointsTo: 'aldric',
    },
    {
      id: 'clue_aldric_forge',
      content: 'Aldric says he was working late that night. But Kira passed the forge - it was cold.',
      source: 'kira',
      revealCondition: { type: 'trust', value: 50 },
      revealed: false,
      pointsTo: 'aldric',
    },

    // Day 3-4: Thom introduction
    {
      id: 'clue_quick_ruling',
      content: 'Guard Captain Thom ruled it an accident within hours. No investigation.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 50 },
      revealed: false,
      pointsTo: 'thom',
    },
    {
      id: 'clue_harren_ledger',
      content: 'Harren kept a ledger. It\'s missing. He wrote down everything - including things people wanted forgotten.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 55 },
      revealed: false,
      pointsTo: 'thom',
    },

    // Day 4-5: Elena introduction
    {
      id: 'clue_wounds',
      content: 'Elena the herbalist treated Harren\'s wounds. She said they were strange for a fall.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 55 },
      revealed: false,
      pointsTo: 'truth',
    },
    {
      id: 'clue_elena_ingredient',
      content: 'Harren had something Elena wanted. A rare herb. They argued about it the day before.',
      source: 'kira',
      revealCondition: { type: 'trust', value: 60 },
      revealed: false,
      pointsTo: 'elena',
    },

    // Day 5-6: The Hooded Figure
    {
      id: 'clue_stranger',
      content: 'A stranger in a dark hood was seen near the tavern that night. No one knew them.',
      source: 'aldric',
      revealCondition: { type: 'trust', value: 50 },
      revealed: false,
      pointsTo: 'hooded',
    },
    {
      id: 'clue_stranger_question',
      content: 'The hooded figure asked about Harren specifically. Where he slept. His habits.',
      source: 'kira',
      revealCondition: { type: 'trust', value: 65 },
      revealed: false,
      pointsTo: 'hooded',
    },

    // Day 6-7: Key revelations
    {
      id: 'clue_cellar_lock',
      content: 'The cellar door was locked from the outside when Maren found Harren. She had to break it.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 70 },
      revealed: false,
      pointsTo: 'truth',
    },
    {
      id: 'clue_harren_letter',
      content: 'Harren received a letter the day before. He burned it immediately, looking shaken.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 75 },
      revealed: false,
      pointsTo: 'hooded',
    },
    {
      id: 'clue_seal',
      content: 'Maren glimpsed the seal on that letter. A black sun. She doesn\'t know what it means.',
      source: 'maren',
      revealCondition: { type: 'trust', value: 80 },
      revealed: false,
      pointsTo: 'truth',
    },
  ],

  solution: 'Harren was murdered by an agent of the Black Sun - a shadowy organization he once crossed. The hooded figure was their assassin. Harren knew they were coming, which is why he arranged for the tavern to pass to a stranger (the player) rather than someone local who could be targeted. The local suspects had motives, but none killed him. The truth leads to a larger conspiracy.',

  revealedClues: [],
  dayStarted: 1,
};

// FTUE progression stages - what Maren reveals when
export const FTUE_STAGES = [
  {
    stage: 0,
    trustRequired: 30,
    marenDialogue: 'You\'re the new owner then. Harren left it to you. Strange choice... he didn\'t know you. But then, Harren did strange things near the end.',
    introduces: [],
  },
  {
    stage: 1,
    trustRequired: 40,
    marenDialogue: 'They say he fell. Down the cellar stairs. I found him. Harren knew every board, every step. Thirty years in this place. Men like that don\'t fall.',
    introduces: [],
  },
  {
    stage: 2,
    trustRequired: 50,
    marenDialogue: 'Aldric the blacksmith... Harren owed him. Could ask him about it. And that merchant, Kira - she was here that week. Sees things, that one.',
    introduces: ['aldric', 'kira'],
  },
  {
    stage: 3,
    trustRequired: 55,
    marenDialogue: 'The guard captain ruled it quick. Too quick. Thom doesn\'t like questions. Never has. Especially about Harren.',
    introduces: ['thom'],
  },
  {
    stage: 4,
    trustRequired: 60,
    marenDialogue: 'Elena the herbalist... she saw the body. Said the wounds were wrong for a fall. But she had her own troubles with Harren.',
    introduces: ['elena'],
  },
  {
    stage: 5,
    trustRequired: 70,
    marenDialogue: 'There was someone else that night. A stranger. Hooded, asking questions. I never saw their face. After that night... gone.',
    introduces: ['hooded'],
  },
  {
    stage: 6,
    trustRequired: 80,
    marenDialogue: 'The cellar door was locked. From the outside. I had to break it to get to him. No one asks about that. No one wants to know.',
    introduces: [],
  },
  {
    stage: 7,
    trustRequired: 90,
    marenDialogue: 'Harren got a letter that last day. Burned it. But I saw the seal. A black sun. He looked... afraid. First time I ever saw fear on that man.',
    introduces: [],
  },
];

export function createFTUEProgress(): FTUEProgress {
  return {
    stage: 0,
    cluesRevealed: [],
    npcsIntroduced: ['maren', 'kira'],  // Start with these
    complete: false,
  };
}

export function checkFTUEProgression(
  currentStage: number,
  marenTrust: number
): { newStage: number; dialogue: string | null; newNPCs: string[] } {
  const nextStageData = FTUE_STAGES.find(s => s.stage === currentStage + 1);

  if (!nextStageData) {
    return { newStage: currentStage, dialogue: null, newNPCs: [] };
  }

  if (marenTrust >= nextStageData.trustRequired) {
    return {
      newStage: nextStageData.stage,
      dialogue: nextStageData.marenDialogue,
      newNPCs: nextStageData.introduces,
    };
  }

  return { newStage: currentStage, dialogue: null, newNPCs: [] };
}
