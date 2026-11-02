// Topic registry. Each topic folder exports its TopicDef as default; order = summary-note sections 1-9.
import type { TopicDef } from '../engine/types';
import type { Part, TopicCode } from '../engine/codes';
import { registerTraps } from '../engine/traps';
import bayes from './bayes';
import filters from './filters';
import models from './models';
import slam from './slam';
import plan from './plan';
import kin from './kin';
import vision from './vision';
import rl from './rl';
import multi from './multi';

export const TOPICS: TopicDef[] = [bayes, filters, models, slam, plan, kin, vision, rl, multi];
TOPICS.forEach((t) => registerTraps(t.traps));

export const topicByCode = (code: string): TopicDef | undefined => TOPICS.find((t) => t.code === code);
export const topicsInPart = (p: Part): TopicDef[] => TOPICS.filter((t) => t.part === p);
export const neighbours = (code: TopicCode): [TopicDef | undefined, TopicDef | undefined] => {
  const i = TOPICS.findIndex((t) => t.code === code);
  return [TOPICS[i - 1], TOPICS[i + 1]];
};
export const challengeIds = (t: TopicDef): string[] => t.explore.filter((e) => e.challenge).map((e) => e.challenge!.id);
