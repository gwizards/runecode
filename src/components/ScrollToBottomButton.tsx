import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  visible: boolean;
  newMessageCount: number;
  onClick: () => void;
}

export function ScrollToBottomButton({ visible, newMessageCount, onClick }: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={onClick}
          className="sticky top-[calc(100%-3rem)] left-[calc(100%-6rem)] z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
          {newMessageCount > 0 && (
            <span className="text-xs font-medium">{newMessageCount}</span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
