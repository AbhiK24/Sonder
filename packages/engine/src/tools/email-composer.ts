/**
 * Email Composer
 *
 * Generates clean, professional emails following best practices.
 * No placeholders - all details filled in.
 */

export interface EmailContext {
  // Sender info
  senderName: string;
  senderEmail?: string;

  // Recipient info
  recipientName?: string;
  recipientEmail: string;

  // Email content
  purpose: string;        // Why are we sending this?
  details?: string;       // Additional context
  tone?: 'formal' | 'friendly' | 'casual';
  urgency?: 'high' | 'normal' | 'low';

  // Meeting/event context (if applicable)
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
}

export interface ComposedEmail {
  to: string[];
  subject: string;
  body: string;
}

/**
 * Generate a professional email prompt for the LLM
 */
export function getEmailCompositionPrompt(context: EmailContext): string {
  const recipientName = context.recipientName || extractNameFromEmail(context.recipientEmail);

  return `## Task: Compose a Professional Email

Write a complete, ready-to-send email. Follow these rules strictly:

### Rules
1. NO placeholders like [Name], [Your Name], etc. - use actual names provided
2. NO "I hope this email finds you well" - get to the point
3. Keep it SHORT - 2-3 sentences max for simple messages
4. State purpose in first sentence
5. Be direct but warm
6. End with a clear sign-off using sender's actual name

### Sender
Name: ${context.senderName}

### Recipient
Name: ${recipientName}
Email: ${context.recipientEmail}

### Purpose
${context.purpose}

${context.details ? `### Additional Details\n${context.details}` : ''}

${context.eventTitle ? `### Event Context\nEvent: ${context.eventTitle}\nDate: ${context.eventDate || 'TBD'}\nTime: ${context.eventTime || 'TBD'}` : ''}

### Tone
${context.tone || 'friendly'} and professional

### Output Format
Return ONLY the email body. Do not include "Subject:" or any other labels.
The email should be complete and ready to send.

### Example Good Email
Hi Arjun,

Quick heads up - I'll be about 15 minutes late to our meeting today. Wrapping up another call that's running over.

Thanks for understanding!

${context.senderName}

### Now write the email:`;
}

/**
 * Generate a good subject line
 */
export function getSubjectLinePrompt(context: EmailContext): string {
  return `Generate a clear, professional email subject line (40-50 characters max).

Purpose: ${context.purpose}
${context.eventTitle ? `Event: ${context.eventTitle}` : ''}

Rules:
- Be specific and actionable
- No "Re:" or "Fwd:" unless replying
- Avoid generic subjects like "Quick question" or "Following up"
- Include key info (date, action needed)

Examples of good subjects:
- "Running 15 min late to Feb 23 meeting"
- "Confirming tomorrow's 3pm call"
- "Request: Review deck by Thursday"

Return ONLY the subject line, nothing else:`;
}

/**
 * Extract name from email address
 */
function extractNameFromEmail(email: string): string {
  const local = email.split('@')[0];

  // Handle common patterns
  // firstname.lastname@ -> Firstname Lastname
  if (local.includes('.')) {
    return local.split('.').map(capitalize).join(' ');
  }

  // firstname_lastname@ -> Firstname Lastname
  if (local.includes('_')) {
    return local.split('_').map(capitalize).join(' ');
  }

  // Just capitalize the local part
  return capitalize(local);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Quick email templates for common scenarios
 */
export const EMAIL_TEMPLATES = {
  runningLate: (senderName: string, recipientName: string, minutes: number, meetingName?: string) => ({
    subject: `Running ${minutes} min late${meetingName ? ` to ${meetingName}` : ''}`,
    body: `Hi ${recipientName},

Quick heads up - I'll be about ${minutes} minutes late${meetingName ? ` to ${meetingName}` : ' to our meeting'}. Apologies for the inconvenience!

${senderName}`
  }),

  reschedule: (senderName: string, recipientName: string, meetingName: string, reason?: string) => ({
    subject: `Need to reschedule: ${meetingName}`,
    body: `Hi ${recipientName},

I need to reschedule ${meetingName}${reason ? ` - ${reason}` : ''}. Would any time tomorrow or later this week work for you?

Let me know what works on your end.

${senderName}`
  }),

  thankYou: (senderName: string, recipientName: string, context: string) => ({
    subject: `Thanks for ${context}`,
    body: `Hi ${recipientName},

Just wanted to say thanks for ${context}. Really appreciate it!

${senderName}`
  }),

  followUp: (senderName: string, recipientName: string, topic: string) => ({
    subject: `Following up: ${topic}`,
    body: `Hi ${recipientName},

Wanted to follow up on ${topic}. Any updates on your end?

${senderName}`
  }),
};
