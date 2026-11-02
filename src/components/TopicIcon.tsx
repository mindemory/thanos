import {
  CodeXml,
  Coffee,
  Compass,
  Library,
  Presentation,
  ScanLine,
  ShieldCheck,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  start: Compass,
  money: Wallet,
  scanning: ScanLine,
  studies: ShieldCheck,
  code: CodeXml,
  equipment: Wrench,
  writing: Presentation,
  life: Coffee,
  other: Library,
};

export function TopicIcon({ topic, size = 16, className }: { topic: string; size?: number; className?: string }) {
  const Icon = ICONS[topic] ?? Library;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
