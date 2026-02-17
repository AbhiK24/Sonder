/**
 * Wanderer's Rest Dashboard
 *
 * Fetches game state and renders the dashboard.
 */

// NPC metadata (for images and categories)
const NPC_META = {
  maren: {
    category: 'townspeople',
    image: '/assets/npcs/maren.png',
    placeholder: '🍺',
  },
  kira: {
    category: 'visitor',
    image: '/assets/npcs/kira.png',
    placeholder: '🎒',
  },
  aldric: {
    category: 'townspeople',
    image: '/assets/npcs/aldric.png',
    placeholder: '🔨',
  },
  elena: {
    category: 'townspeople',
    image: '/assets/npcs/elena.png',
    placeholder: '🌿',
  },
  thom: {
    category: 'townspeople',
    image: '/assets/npcs/thom.png',
    placeholder: '⚔️',
  },
  hooded: {
    category: 'stranger',
    image: '/assets/npcs/hooded.png',
    placeholder: '👤',
  },
};

// Trust level descriptions
function getTrustLevel(trust) {
  if (trust < 30) return 'Stranger';
  if (trust < 50) return 'Acquaintance';
  if (trust < 70) return 'Familiar';
  if (trust < 90) return 'Trusted';
  return 'Confidant';
}

// Render NPC card
function renderNPCCard(npc) {
  const meta = NPC_META[npc.id] || { category: 'unknown', placeholder: '?' };
  const trustLevel = getTrustLevel(npc.trust);
  const conversations = Math.floor((npc.historyLength || 0) / 2);
  const hasImage = false; // Set to true when images are added

  return `
    <div class="npc-card ${meta.category} ${npc.trust < 30 ? 'not-met' : ''}">
      ${hasImage
        ? `<img src="${meta.image}" alt="${npc.name}" class="npc-image" onerror="this.outerHTML='<div class=\\'npc-image placeholder\\'>${meta.placeholder}</div>'">`
        : `<div class="npc-image placeholder">${meta.placeholder}</div>`
      }
      <div class="npc-info">
        <span class="npc-category ${meta.category}">${meta.category}</span>
        <h3 class="npc-name">${npc.name}</h3>
        <p class="npc-role">${npc.role}</p>
        <div class="trust-meter">
          <div class="trust-label">
            <span>Trust</span>
            <span>${npc.trust}/100</span>
          </div>
          <div class="trust-bar">
            <div class="trust-fill" style="width: ${npc.trust}%"></div>
          </div>
          <div class="trust-level">${trustLevel} · ${conversations} conversations</div>
        </div>
      </div>
    </div>
  `;
}

// Render case board
function renderCase(caseData) {
  if (!caseData) {
    return '<p class="empty-state">No active mystery.</p>';
  }

  const cluesFound = caseData.revealedClues?.length || 0;
  const totalClues = caseData.clues?.length || 0;
  const suspects = caseData.suspects || [];
  const suspiciousSuspects = suspects.filter(s => s.suspicionLevel > 0);

  return `
    <h3 class="case-title">${caseData.title}</h3>
    <p class="case-hook">${caseData.hook}</p>
    <div class="case-progress">
      <div class="progress-item">
        <span class="progress-label">Clues</span>
        <span class="progress-value">${cluesFound}/${totalClues}</span>
      </div>
      <div class="progress-item">
        <span class="progress-label">Suspects</span>
        <span class="progress-value">${suspiciousSuspects.length}/${suspects.length}</span>
      </div>
      <div class="progress-item">
        <span class="progress-label">Status</span>
        <span class="progress-value">${caseData.status}</span>
      </div>
    </div>
    ${suspects.length > 0 ? `
      <div class="suspects-list">
        ${suspects.map(s => `
          <span class="suspect-tag ${s.suspicionLevel > 0 ? 'suspicious' : ''}">${s.npcId}</span>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// Render clues list
function renderClues(cases) {
  const allClues = [];

  for (const c of cases) {
    if (!c.clues) continue;
    for (const clue of c.clues) {
      if (clue.revealed) {
        allClues.push({
          content: clue.content,
          source: clue.source,
          case: c.title,
        });
      }
    }
  }

  if (allClues.length === 0) {
    return '<li class="empty-state">No clues discovered yet.</li>';
  }

  return allClues.map(clue => `
    <li>
      ${clue.content}
      <div class="clue-source">From: ${clue.source}</div>
    </li>
  `).join('');
}

// Render facts list
function renderFacts(facts) {
  if (!facts || facts.length === 0) {
    return '<li class="empty-state">No facts learned yet.</li>';
  }

  const statusIcons = {
    unverified: '❓',
    verified: '✓',
    contradicted: '⚠️',
    lie: '✗',
    truth: '✓✓',
  };

  return facts.slice(-10).map(fact => `
    <li>
      <span class="fact-status ${fact.status}">${statusIcons[fact.status] || '?'}</span>
      ${fact.claim}
      <div class="fact-source">${fact.source?.name || 'Unknown'} · Day ${fact.source?.day || '?'}</div>
    </li>
  `).join('');
}

// Render suspicions
function renderSuspicions(facts) {
  const suspicious = (facts || []).filter(f =>
    f.status === 'contradicted' || f.status === 'lie'
  );

  if (suspicious.length === 0) {
    return '<p class="empty-state">Your gut tells you nothing seems off... yet.</p>';
  }

  return suspicious.map(fact => `
    <div class="suspicion-item">
      <span class="suspicion-npc">${fact.source?.name || 'Someone'}</span> claimed: "${fact.claim}"
      <div class="clue-source">Status: ${fact.status}</div>
    </div>
  `).join('');
}

// Main render function
function renderDashboard(data) {
  // Day
  document.getElementById('currentDay').textContent = data.day || 1;

  // NPCs
  const npcGrid = document.getElementById('npcGrid');
  if (data.npcs && data.npcs.length > 0) {
    npcGrid.innerHTML = data.npcs.map(renderNPCCard).join('');
  } else {
    npcGrid.innerHTML = '<p class="empty-state">No souls present.</p>';
  }

  // Case
  const caseBoard = document.getElementById('caseBoard');
  const activeCase = data.cases?.find(c => c.status === 'active');
  caseBoard.innerHTML = renderCase(activeCase);

  // Clues
  document.getElementById('clueList').innerHTML = renderClues(data.cases || []);

  // Facts
  document.getElementById('factList').innerHTML = renderFacts(data.facts);

  // Suspicions
  document.getElementById('suspicions').innerHTML = renderSuspicions(data.facts);

  // Stats
  const totalConvos = (data.npcs || []).reduce((sum, npc) =>
    sum + Math.floor((npc.historyLength || 0) / 2), 0
  );
  document.getElementById('totalConvos').textContent = totalConvos;
  document.getElementById('totalFacts').textContent = data.facts?.length || 0;

  const totalClues = (data.cases || []).reduce((sum, c) =>
    sum + (c.revealedClues?.length || 0), 0
  );
  document.getElementById('totalClues').textContent = totalClues;
  document.getElementById('totalTokens').textContent =
    (data.tokens?.total || 0).toLocaleString();

  // Last updated
  document.getElementById('lastUpdated').textContent =
    new Date().toLocaleString();
}

// Fetch state from API
async function fetchState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('Failed to fetch state');
    const data = await response.json();
    renderDashboard(data);
  } catch (error) {
    console.error('Error fetching state:', error);
    // Load demo data for preview
    renderDashboard(DEMO_DATA);
  }
}

// Demo data for preview/development
const DEMO_DATA = {
  day: 3,
  npcs: [
    { id: 'maren', name: 'Maren', role: 'Barkeep', trust: 52, historyLength: 14 },
    { id: 'kira', name: 'Kira', role: 'Merchant', trust: 38, historyLength: 6 },
    { id: 'aldric', name: 'Aldric', role: 'Blacksmith', trust: 25, historyLength: 2 },
    { id: 'elena', name: 'Elena', role: 'Herbalist', trust: 20, historyLength: 0 },
    { id: 'thom', name: 'Thom', role: 'Guard Captain', trust: 15, historyLength: 0 },
    { id: 'hooded', name: 'The Hooded Figure', role: 'Unknown', trust: 0, historyLength: 0 },
  ],
  cases: [
    {
      id: 'ftue_harren_death',
      title: 'The Death of Old Harren',
      hook: 'They say he fell down the cellar stairs. But Maren\'s eyes tell a different story.',
      status: 'active',
      clues: [
        { id: 'c1', content: 'Harren fell down the cellar stairs three weeks ago.', source: 'maren', revealed: true },
        { id: 'c2', content: 'Maren doesn\'t believe it was an accident.', source: 'maren', revealed: true },
        { id: 'c3', content: 'The blacksmith was owed money.', source: 'maren', revealed: true },
        { id: 'c4', content: 'Hidden clue', source: 'unknown', revealed: false },
      ],
      revealedClues: ['c1', 'c2', 'c3'],
      suspects: [
        { npcId: 'aldric', suspicionLevel: 20 },
        { npcId: 'thom', suspicionLevel: 0 },
        { npcId: 'elena', suspicionLevel: 0 },
        { npcId: 'hooded', suspicionLevel: 10 },
      ],
    },
  ],
  facts: [
    { claim: 'Harren knew every board in this place', source: { name: 'maren', day: 1 }, status: 'verified' },
    { claim: 'Aldric was at the forge all night', source: { name: 'aldric', day: 2 }, status: 'contradicted' },
    { claim: 'The forge was cold that night', source: { name: 'kira', day: 2 }, status: 'verified' },
    { claim: 'Guard Captain ruled it an accident', source: { name: 'maren', day: 1 }, status: 'unverified' },
  ],
  tokens: {
    total: 12450,
  },
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchState();

  // Refresh every 30 seconds
  setInterval(fetchState, 30000);
});
