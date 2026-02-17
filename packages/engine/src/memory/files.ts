/**
 * Memory File Operations
 *
 * Read/write markdown files for NPC memory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import matter from 'gray-matter';
import type { NPCIdentity, NPCMemory, Statement, Assertion } from '../types/index.js';

/**
 * Load IDENTITY.md file
 */
export async function loadIdentity(path: string): Promise<NPCIdentity> {
  if (!existsSync(path)) {
    throw new Error(`Identity file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  const { data, content: body } = matter(content);

  return {
    name: data.name ?? 'Unknown',
    role: data.role ?? '',
    personality: data.personality ?? [],
    voicePatterns: data.voice_patterns ?? [],
    examplePhrases: data.example_phrases ?? [],
    backstory: body,
    currentGoals: data.goals ?? [],
    quirks: data.quirks ?? [],
  };
}

/**
 * Load MEMORY.md file (assertions)
 */
export async function loadMemory(path: string): Promise<NPCMemory> {
  if (!existsSync(path)) {
    return {
      aboutPlayer: [],
      aboutOthers: {},
      worldFacts: [],
    };
  }

  const content = readFileSync(path, 'utf-8');

  // Parse markdown sections into assertions
  const memory: NPCMemory = {
    aboutPlayer: [],
    aboutOthers: {},
    worldFacts: [],
  };

  // Simple parsing - would be more sophisticated in production
  const lines = content.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('## About Player')) {
      currentSection = 'player';
    } else if (line.startsWith('## About')) {
      currentSection = line.replace('## About ', '').toLowerCase();
    } else if (line.startsWith('- ')) {
      const assertion = parseAssertion(line.slice(2));
      if (currentSection === 'player') {
        memory.aboutPlayer.push(assertion);
      } else if (currentSection) {
        if (!memory.aboutOthers[currentSection]) {
          memory.aboutOthers[currentSection] = [];
        }
        memory.aboutOthers[currentSection].push(assertion);
      }
    }
  }

  return memory;
}

/**
 * Load STATEMENTS.md file
 */
export async function loadStatements(path: string): Promise<Statement[]> {
  if (!existsSync(path)) {
    return [];
  }

  const content = readFileSync(path, 'utf-8');
  const statements: Statement[] = [];

  // Parse statements
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('- ')) {
      // Format: - [Day X] "statement" (context)
      const match = line.match(/- \[Day (\d+)\] "([^"]+)"(?: \((.+)\))?/);
      if (match) {
        statements.push({
          content: match[2],
          day: parseInt(match[1]),
          context: match[3] ?? '',
          verifiable: true,
        });
      }
    }
  }

  return statements;
}

/**
 * Save MEMORY.md file
 */
export async function saveMemory(path: string, memory: NPCMemory): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let content = '# Memory\n\n';

  content += '## About Player\n\n';
  for (const assertion of memory.aboutPlayer) {
    content += `- [Day ${assertion.day}] ${assertion.content}\n`;
  }

  for (const [npc, assertions] of Object.entries(memory.aboutOthers)) {
    content += `\n## About ${npc}\n\n`;
    for (const assertion of assertions) {
      content += `- [Day ${assertion.day}] ${assertion.content}\n`;
    }
  }

  writeFileSync(path, content);
}

/**
 * Save STATEMENTS.md file
 */
export async function saveStatements(path: string, statements: Statement[]): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let content = '# Statements\n\n';

  for (const statement of statements) {
    content += `- [Day ${statement.day}] "${statement.content}"`;
    if (statement.context) {
      content += ` (${statement.context})`;
    }
    content += '\n';
  }

  writeFileSync(path, content);
}

/**
 * Parse assertion from markdown line
 */
function parseAssertion(line: string): Assertion {
  // Format: [Day X] content
  const match = line.match(/\[Day (\d+)\] (.+)/);

  if (match) {
    return {
      content: match[2],
      day: parseInt(match[1]),
      confidence: 'high',
      type: 'fact_about_player',
    };
  }

  return {
    content: line,
    day: 0,
    confidence: 'medium',
    type: 'fact_about_player',
  };
}
