import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Loader2, ChevronLeft, type LucideIcon } from 'lucide-react';
import React from 'react';

export type StepStatus = 'pending' | 'checking' | 'passed' | 'failed' | 'skipped';

interface StepCardProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  icon: LucideIcon;
  status: StepStatus;
  children?: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function StepCard({
  step,
  totalSteps,
  title,
  description,
  icon: Icon,
  status,
  children,
  onNext,
  onBack,
  onSkip,
  canSkip = false,
  nextLabel = 'Next',
  nextDisabled = false,
}: StepCardProps) {
  const progressPercent = Math.round((step / totalSteps) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden w-full max-w-lg"
    >
      {/* Progress bar */}
      <div className="h-1 w-full bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-600 to-purple-400"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Step indicator */}
        <div className="text-xs text-white/40 font-medium tracking-wide uppercase">
          Step {step} of {totalSteps}
        </div>

        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Icon box */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <Icon className="w-6 h-6 text-purple-400" />
          </div>

          {/* Title + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white leading-tight">{title}</h2>
              <AnimatePresence mode="wait">
                {status === 'checking' && (
                  <motion.span
                    key="checking"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  </motion.span>
                )}
                {status === 'passed' && (
                  <motion.span
                    key="passed"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-green-400" />
                  </motion.span>
                )}
                {status === 'failed' && (
                  <motion.span
                    key="failed"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-white/60 leading-relaxed">{description}</p>

        {/* Children slot */}
        {children && <div className="flex flex-col gap-3">{children}</div>}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            {canSkip && onSkip && (
              <button
                onClick={onSkip}
                className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Skip
              </button>
            )}
          </div>

          <button
            onClick={onNext}
            disabled={nextDisabled || status === 'checking'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {status === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}
            {nextLabel}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
