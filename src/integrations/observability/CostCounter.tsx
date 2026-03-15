import { DollarSign } from 'lucide-react';

interface CostCounterProps {
  costUsd: number;
}

export function CostCounter({ costUsd }: CostCounterProps) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <DollarSign className="h-3 w-3 text-green-500" />
      <span>${costUsd.toFixed(3)}</span>
    </div>
  );
}
