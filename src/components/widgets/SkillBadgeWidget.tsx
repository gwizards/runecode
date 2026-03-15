import { Zap } from 'lucide-react';

interface SkillBadgeWidgetProps {
  skillName: string;
}

export function SkillBadgeWidget({ skillName }: SkillBadgeWidgetProps) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs my-1">
      <Zap className="h-3 w-3" />
      <span>Using: {skillName}</span>
    </div>
  );
}
