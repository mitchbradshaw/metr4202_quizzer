// Topic ids follow the sections of the METR4202 exam summary notes (1-9). Pure module (no React).
export const TOPIC_CODES = ['bayes', 'filters', 'models', 'slam', 'plan', 'kin', 'vision', 'rl', 'multi'] as const;

export type TopicCode = (typeof TOPIC_CODES)[number];
/** Where a topic sits on the see-think-act loop (the course map in the summary notes). */
export type Part = 'estimate' | 'decide' | 'act' | 'see' | 'team';
export type Tier = 1 | 2 | 3;

export const PART_ORDER: Part[] = ['estimate', 'decide', 'act', 'see', 'team'];

export const PART_TITLES: Record<Part, string> = {
  estimate: 'Think: estimate where you are',
  decide: 'Think: decide what to do next',
  act: 'Act: move the robot',
  see: 'See: perception',
  team: 'Many robots',
};

/** Short stage labels for tiles. */
export const PART_SHORT: Record<Part, string> = {
  estimate: 'Think · estimate',
  decide: 'Think · decide',
  act: 'Act',
  see: 'See',
  team: 'Many robots',
};

export function isTopicCode(s: string): s is TopicCode {
  return (TOPIC_CODES as readonly string[]).includes(s);
}
