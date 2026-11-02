// The shelves every lab's knowledge sits on. The same for every lab for now; the last one takes
// whatever fits nowhere else. Icons are in components/TopicIcon.tsx, so this stays plain data.

export const TOPICS = [
  { id: "start", label: "Getting started", hint: "Accounts, keys, the first weeks" },
  { id: "money", label: "Money & purchasing", hint: "Chart strings, grants, the lab card, reimbursements" },
  { id: "scanning", label: "Scanning", hint: "Booking, safety, which grant pays" },
  { id: "studies", label: "Studies & IRB", hint: "Protocols, consent, recruiting and paying participants" },
  { id: "code", label: "Code & data", hint: "Toolboxes, GitHub, the cluster, where data lives" },
  { id: "equipment", label: "Equipment & space", hint: "Rooms, eye trackers, computers, printers" },
  { id: "writing", label: "Writing & talks", hint: "Templates, posters, the lab's conventions" },
  { id: "life", label: "Lab life", hint: "Meetings, norms, who to ask" },
  { id: "other", label: "Everything else", hint: "Whatever fits nowhere above" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

export function topicOf(id: string) {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[TOPICS.length - 1];
}

export function isTopic(id: string): id is TopicId {
  return TOPICS.some((t) => t.id === id);
}
