import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings, Minus, Square, X, Bot, Cpu } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TooltipProvider, TooltipSimple } from '@/components/ui/tooltip-modern';

interface CustomTitlebarProps {
  onSettingsClick?: () => void;
  onAgentsClick?: () => void;
}

export const CustomTitlebar: React.FC<CustomTitlebarProps> = ({
  onSettingsClick,
  onAgentsClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
      console.log('Window minimized successfully');
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow();
      const isMaximized = await window.isMaximized();
      if (isMaximized) {
        await window.unmaximize();
        console.log('Window unmaximized successfully');
      } else {
        await window.maximize();
        console.log('Window maximized successfully');
      }
    } catch (error) {
      console.error('Failed to maximize/unmaximize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
      console.log('Window closed successfully');
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  return (
    <TooltipProvider>
    <div 
      className="relative z-[200] h-11 bg-background/95 backdrop-blur-sm flex items-center justify-between select-none border-b border-border/50 tauri-drag"
      data-tauri-drag-region
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left side - macOS Traffic Light buttons */}
      <div className="flex items-center space-x-2 pl-5">
        <div className="flex items-center space-x-2">
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="group relative w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
            title="Close"
          >
            {isHovered && (
              <X size={8} className="text-red-900 opacity-60 group-hover:opacity-100" />
            )}
          </button>

          {/* Minimize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMinimize();
            }}
            className="group relative w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
            title="Minimize"
          >
            {isHovered && (
              <Minus size={8} className="text-yellow-900 opacity-60 group-hover:opacity-100" />
            )}
          </button>

          {/* Maximize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMaximize();
            }}
            className="group relative w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
            title="Maximize"
          >
            {isHovered && (
              <Square size={6} className="text-green-900 opacity-60 group-hover:opacity-100" />
            )}
          </button>
        </div>
      </div>

      {/* Center - Title (hidden) */}
      {/* <div 
        className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        data-tauri-drag-region
      >
        <span className="text-sm font-medium text-foreground/80">{title}</span>
      </div> */}

      {/* Right side - Navigation icons with improved spacing */}
      <div className="flex items-center pr-5 gap-3 tauri-no-drag">
        {/* Primary actions group */}
        <div className="flex items-center gap-1">
          {onAgentsClick && (
            <TooltipSimple content="Agents" side="bottom">
              <motion.button
                onClick={onAgentsClick}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
                aria-label="Agents"
              >
                <Bot size={16} />
              </motion.button>
            </TooltipSimple>
          )}
          


          <TooltipSimple content="System Processes" side="bottom">
            <motion.button
              onClick={() => window.dispatchEvent(new CustomEvent('open-resource-details'))}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
              aria-label="System Processes"
            >
              <Cpu size={16} />
            </motion.button>
          </TooltipSimple>
        </div>

        {/* Visual separator */}
        <div className="w-px h-5 bg-border/50" />

        {/* Secondary actions group */}
        <div className="flex items-center gap-1">
          {onSettingsClick && (
            <TooltipSimple content="Settings" side="bottom">
              <motion.button
                onClick={onSettingsClick}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
                aria-label="Settings"
              >
                <Settings size={16} />
              </motion.button>
            </TooltipSimple>
          )}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
};
