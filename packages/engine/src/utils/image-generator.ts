/**
 * Image Generator
 *
 * Generates NPC portrait images using DALL-E 3.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

interface ImageGeneratorConfig {
  apiKey: string;
  model?: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}

interface GeneratedImage {
  url: string;
  revisedPrompt: string;
}

// NPC portrait prompt template
const PORTRAIT_TEMPLATE = `Fantasy tavern character portrait, {description}.
Style: Oil painting, warm candlelight atmosphere, fantasy RPG character art, bust portrait facing slightly left.
Setting: Medieval fantasy tavern interior with warm amber lighting.
Quality: Highly detailed, professional fantasy art, no text or watermarks.`;

// Category-specific style additions
const CATEGORY_STYLES: Record<string, string> = {
  townspeople: 'Weathered but trustworthy appearance, lived-in clothes, comfortable in their environment',
  visitor: 'Travel-worn but presentable, carrying hints of distant places, observant eyes',
  stranger: 'Mysterious and guarded, shadows obscuring features, unsettling presence',
};

export class ImageGenerator {
  private apiKey: string;
  private model: string;
  private size: string;
  private quality: string;
  private style: string;

  constructor(config: ImageGeneratorConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'dall-e-3';
    this.size = config.size || '1024x1024';
    this.quality = config.quality || 'standard';
    this.style = config.style || 'vivid';
  }

  /**
   * Generate a portrait for an NPC
   */
  async generatePortrait(
    name: string,
    role: string,
    category: string,
    personality: string[],
    appearance?: string
  ): Promise<GeneratedImage> {
    const categoryStyle = CATEGORY_STYLES[category] || '';

    const description = [
      `${name} the ${role.toLowerCase()}`,
      appearance || `${personality.slice(0, 2).join(', ')} character`,
      categoryStyle,
    ].filter(Boolean).join(', ');

    const prompt = PORTRAIT_TEMPLATE.replace('{description}', description);

    return this.generate(prompt);
  }

  /**
   * Generate an image from a prompt
   */
  async generate(prompt: string): Promise<GeneratedImage> {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        size: this.size,
        quality: this.quality,
        style: this.style,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`DALL-E API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      url: data.data[0].url,
      revisedPrompt: data.data[0].revised_prompt,
    };
  }

  /**
   * Download an image and save it locally
   */
  async downloadImage(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Ensure directory exists
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(outputPath, buffer);
  }

  /**
   * Generate and save an NPC portrait
   */
  async generateAndSave(
    name: string,
    role: string,
    category: string,
    personality: string[],
    outputPath: string,
    appearance?: string
  ): Promise<{ url: string; savedTo: string; revisedPrompt: string }> {
    console.log(`Generating portrait for ${name}...`);

    const result = await this.generatePortrait(name, role, category, personality, appearance);

    console.log(`Downloading to ${outputPath}...`);
    await this.downloadImage(result.url, outputPath);

    return {
      url: result.url,
      savedTo: outputPath,
      revisedPrompt: result.revisedPrompt,
    };
  }
}

/**
 * Build a prompt for an NPC based on their identity
 */
export function buildNPCPrompt(identity: {
  name: string;
  role: string;
  personality: string[];
  quirks?: string[];
  voicePatterns?: string[];
}, category: string = 'townspeople'): string {
  const categoryStyle = CATEGORY_STYLES[category] || '';

  // Extract visual cues from quirks
  const visualQuirks = (identity.quirks || [])
    .filter(q =>
      q.includes('soot') ||
      q.includes('scar') ||
      q.includes('hair') ||
      q.includes('eyes') ||
      q.includes('hands') ||
      q.includes('wears') ||
      q.includes('smell')
    )
    .slice(0, 2);

  const description = [
    `${identity.name} the ${identity.role.toLowerCase()}`,
    identity.personality.slice(0, 3).join(', '),
    ...visualQuirks,
    categoryStyle,
  ].filter(Boolean).join(', ');

  return PORTRAIT_TEMPLATE.replace('{description}', description);
}
