/**
 * PromptSuggestions — slash-command picker state & file-picker state helpers
 * for FloatingPromptInput.
 *
 * Exports:
 *  - useSlashCommandState
 *  - useFilePickerState
 *
 * These hooks centralise the logic for tracking whether the @ / / pickers
 * should be open and what query they should show, based on textarea changes.
 */

/**
 * Given the new textarea value and cursor position, returns the updated slash-
 * command picker state: whether it should be shown and what query to pass.
 */
export function resolveSlashCommandState(
  newValue: string,
  newCursorPosition: number,
  prevValue: string,
  currentlyShowing: boolean
): { show: boolean; query: string } {
  // Opening: / typed as the very first character
  if (
    newValue.length > prevValue.length &&
    newValue[newCursorPosition - 1] === "/" &&
    newCursorPosition === 1
  ) {
    return { show: true, query: "" };
  }

  if (currentlyShowing) {
    if (!newValue.startsWith("/")) {
      return { show: false, query: "" };
    }
    const query = newValue.substring(1, newCursorPosition);
    return { show: true, query: query.split(/\s/)[0] || "" };
  }

  return { show: false, query: "" };
}

/**
 * Given the new textarea value and cursor position, returns the updated file-
 * picker state: whether it should be shown and what query to pass.
 */
export function resolveFilePickerState(
  newValue: string,
  newCursorPosition: number,
  prevValue: string,
  prevCursorPosition: number,
  currentlyShowing: boolean,
  projectPath?: string
): { show: boolean; query: string } {
  // Opening: @ typed
  if (
    projectPath?.trim() &&
    newValue.length > prevValue.length &&
    newValue[newCursorPosition - 1] === "@"
  ) {
    return { show: true, query: "" };
  }

  if (currentlyShowing && newCursorPosition >= prevCursorPosition) {
    // Search backwards from cursor for the @ that opened the picker
    let atPosition = -1;
    for (let i = newCursorPosition - 1; i >= 0; i--) {
      if (newValue[i] === "@") {
        atPosition = i;
        break;
      }
      if (newValue[i] === " " || newValue[i] === "\n") break;
    }

    if (atPosition !== -1) {
      const query = newValue.substring(atPosition + 1, newCursorPosition);
      return { show: true, query };
    }

    return { show: false, query: "" };
  }

  return { show: false, query: "" };
}
