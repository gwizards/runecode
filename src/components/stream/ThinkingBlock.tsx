/**
 * ThinkingBlock — renders a thinking/reasoning content block from an assistant message.
 *
 * Thin wrapper around ThinkingWidget that lives in its own file so StreamMessage
 * can import it without pulling in the full ToolUseBlock bundle when not needed.
 */

import React from "react";
import { ThinkingWidget } from "../ToolWidgets";

interface ThinkingBlockProps {
  thinking: string;
  signature?: string;
  idx: number;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  thinking,
  signature,
  idx,
}) => {
  return (
    <div key={idx}>
      <ThinkingWidget thinking={thinking} signature={signature} />
    </div>
  );
};
