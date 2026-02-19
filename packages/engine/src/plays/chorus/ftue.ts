/**
 * Chorus FTUE (First Time User Experience)
 *
 * The flow:
 * 1. Luna welcomes warmly (not generically)
 * 2. Quick context: recent win, recent struggle
 * 3. Goal gathering: professional, personal, relationship
 * 4. Value demo: show how all 5 agents see their situation
 * 5. Return hook: schedule a check-in
 */

import type { FTUEFlow, FTUEStep, FTUEContext } from '../../ftue/types.js';
import { createGoal, type GoalDomain, type GoalTimeline } from '../../user/types.js';
import { parseTimelineNatural } from '../../ftue/types.js';

/**
 * Chorus FTUE Flow Definition
 */
export const chorusFTUE: FTUEFlow = {
  playId: 'chorus',

  steps: [
    // ==========================================================================
    // Step 1: Luna's warm welcome
    // ==========================================================================
    {
      id: 'welcome',
      type: 'message',
      agent: 'luna',
      content: `Hey. I know we just met, but I already have a sense you're someone who carries a lot.

The Chorus is here now. Five of us, each seeing things a little differently. You don't have to explain everything—we'll figure it out together.

I'm Luna. I keep track of things, remember what matters, make sure nothing falls through the cracks. The others are here too, and they're already curious about you.

Before we dive in... can I ask you something?`,
      delayMs: 1000,
    },

    // ==========================================================================
    // Step 2: Recent win
    // ==========================================================================
    {
      id: 'ask_win',
      type: 'question',
      agent: 'luna',
      content: `What's one recent win? Doesn't have to be big. Just something that went right.`,
      delayMs: 500,
      processResponse: (response, context) => {
        context.responses['recent_win'] = response;
        context.userProfile.context.recentWin = response;
      },
    },

    // Joy celebrates the win
    {
      id: 'celebrate_win',
      type: 'message',
      agent: 'joy',
      content: (context) => {
        const win = context.responses['recent_win'];
        return `Wait—I have to jump in. ${win}? That's not nothing. That's YOU making something happen.

I'm Joy, by the way. I notice the good stuff. Someone has to, right?

Luna, keep going. I'll be here.`;
      },
      delayMs: 800,
    },

    // ==========================================================================
    // Step 3: Recent struggle
    // ==========================================================================
    {
      id: 'ask_struggle',
      type: 'question',
      agent: 'luna',
      content: `And what's one thing that's been hard lately? Something weighing on you.`,
      delayMs: 500,
      processResponse: (response, context) => {
        context.responses['recent_struggle'] = response;
        context.userProfile.context.recentStruggle = response;
      },
    },

    // Sage offers perspective
    {
      id: 'sage_perspective',
      type: 'message',
      agent: 'sage',
      content: (context) => {
        const struggle = context.responses['recent_struggle'];
        return `I'm Sage. I tend to see the longer view.

What you're describing—${struggle.slice(0, 50)}...—it sounds like you're in the middle of something. Not at the end, not stuck forever. In the middle.

That's actually important to know. You're not failing. You're navigating.`;
      },
      delayMs: 800,
    },

    // ==========================================================================
    // Step 4: Goal gathering - Professional
    // ==========================================================================
    {
      id: 'ask_professional_goal',
      type: 'goal_gathering',
      agent: 'ember',
      content: `Alright, my turn. I'm Ember—I'm the one who'll push you when you need it. Gently. Mostly.

Let's talk about what you're working toward. What's one thing you want to achieve at work or in your career?`,
      delayMs: 600,
      processResponse: (response, context) => {
        context.responses['professional_goal_statement'] = response;
      },
    },

    {
      id: 'ask_professional_why',
      type: 'question',
      agent: 'ember',
      content: `Why does that matter to you? Like, really—what would it mean?`,
      delayMs: 400,
      processResponse: (response, context) => {
        context.responses['professional_goal_why'] = response;
      },
    },

    {
      id: 'ask_professional_when',
      type: 'question',
      agent: 'ember',
      content: `And when do you think that might happen? Any timeline in mind?`,
      delayMs: 400,
      processResponse: (response, context) => {
        const { timeline, targetDate } = parseTimelineNatural(response);
        const goal = createGoal(
          'professional',
          context.responses['professional_goal_statement'],
          context.responses['professional_goal_why'],
          timeline,
          targetDate
        );
        context.goalsGathered.push(goal);
        context.userProfile.goals.push(goal);
      },
    },

    // ==========================================================================
    // Step 5: Goal gathering - Personal
    // ==========================================================================
    {
      id: 'ask_personal_goal',
      type: 'goal_gathering',
      agent: 'luna',
      content: `Okay, one more. Outside of work—is there something personal you're focused on? A goal just for you?`,
      delayMs: 600,
      processResponse: (response, context) => {
        // Check if they want to skip
        const lower = response.toLowerCase();
        if (lower.includes('skip') || lower.includes('not really') || lower.includes('none')) {
          context.responses['personal_goal_skipped'] = 'true';
          return;
        }
        context.responses['personal_goal_statement'] = response;
      },
    },

    {
      id: 'ask_personal_why',
      type: 'question',
      agent: 'luna',
      content: `What would achieving that give you?`,
      delayMs: 400,
      condition: (context) => !context.responses['personal_goal_skipped'],
      processResponse: (response, context) => {
        context.responses['personal_goal_why'] = response;
        // Default timeline for personal goals
        const goal = createGoal(
          'personal',
          context.responses['personal_goal_statement'],
          response,
          'ongoing'
        );
        context.goalsGathered.push(goal);
        context.userProfile.goals.push(goal);
      },
    },

    // ==========================================================================
    // Step 6: Value demo - Show all perspectives
    // ==========================================================================
    {
      id: 'value_demo_intro',
      type: 'message',
      agent: 'luna',
      content: `Okay. I've been sharing all of this with the others. Let me tell you how each of us sees your situation.`,
      delayMs: 800,
    },

    {
      id: 'value_demo',
      type: 'value_demo',
      content: (context) => {
        // Synthesize short descriptions instead of verbatim quotes
        const goal = context.goalsGathered[0];
        const goalDomain = goal?.domain || 'professional';
        const goalSummary = goalDomain === 'professional' ? 'your professional ambitions'
          : goalDomain === 'personal' ? 'your personal growth'
          : goalDomain === 'relationship' ? 'your relationships'
          : goalDomain === 'health' ? 'your health and wellbeing'
          : 'what matters to you';

        return `**Here's how the Chorus sees you:**

🌙 **Luna** (that's me): I've got it all—the wins, the struggles, what you're working toward. I'll bring them up when they matter. Nothing falls through the cracks with me.

🔥 **Ember**: When you're stuck or losing momentum on ${goalSummary}—that's when I show up. I'll remind you that you've done hard things before.

🌿 **Sage**: When things feel overwhelming, I'll be here to zoom out. Every struggle is a chapter, not the whole story. We'll find the wisdom in it.

✨ **Joy**: I'll make sure we celebrate. Not just the big wins—the small ones too. You deserve to feel good about progress.

🪞 **Echo**: I'll reflect back what I notice. Patterns you might miss. How you're feeling beneath the surface. Sometimes you need a mirror.

**That's the Chorus. Five voices, one mission: you.**`;
      },
      delayMs: 1000,
    },

    // ==========================================================================
    // Step 7: Return hook
    // ==========================================================================
    {
      id: 'return_hook',
      type: 'hook',
      agent: 'luna',
      content: (context) => {
        const goal = context.goalsGathered[0];
        const timeline = goal?.timeline || 'soon';

        let hookMessage = `I'm going to check in on you. Not in an annoying way—just... I'll be here.`;

        if (timeline === 'this_week') {
          hookMessage += `\n\nActually, since ${goal?.statement} is happening soon, I'll reach out in a couple days. Just to see how you're feeling about it.`;
        } else if (timeline === 'this_month') {
          hookMessage += `\n\nWith ${goal?.statement} on the horizon, expect a check-in from me or Ember before it gets too close.`;
        } else {
          hookMessage += `\n\nTomorrow morning, I'll say hi. Nothing heavy—just a quick "how are you starting the day?"`;
        }

        hookMessage += `\n\nIf you ever need us before that, just send a message. We're here.`;

        return hookMessage;
      },
      delayMs: 800,
    },

    // Final message
    {
      id: 'ftue_complete',
      type: 'message',
      agent: 'luna',
      content: `Welcome to the Chorus. 🎵

Now—is there anything on your mind right now? Or are you good for today?`,
      delayMs: 600,
    },
  ],

  onComplete: (context) => {
    context.userProfile.ftueCompleted = true;
    context.userProfile.ftueCompletedAt = new Date();
    context.completedAt = new Date();

    // Log what was gathered
    console.log('[Chorus FTUE] Complete:', {
      userId: context.userId,
      goalsGathered: context.goalsGathered.length,
      goals: context.goalsGathered.map(g => ({ domain: g.domain, statement: g.statement })),
    });
  },
};

/**
 * Get the intro message for users who've already done FTUE
 */
export function getReturningUserGreeting(context: FTUEContext): string {
  const lastGoal = context.userProfile.goals[0];
  const timeSinceLastSeen = context.userProfile.updatedAt
    ? Date.now() - context.userProfile.updatedAt.getTime()
    : 0;

  const hoursAway = Math.floor(timeSinceLastSeen / (1000 * 60 * 60));

  if (hoursAway > 48) {
    return `Hey. It's been a few days. I've been thinking about you—especially about ${lastGoal?.statement || "what you're working on"}. How have things been?`;
  } else if (hoursAway > 12) {
    return `You're back. Good to see you. Anything on your mind?`;
  } else {
    return `Hey again. What's up?`;
  }
}
