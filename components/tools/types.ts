/**
 * The contract every instant tool implements — docs/04_AGENT_SPEC.md §7
 *
 * Separate from `components/tools/registry.tsx` because the registry imports the
 * tool components; a type the components need cannot live in the module that
 * lazily imports them without a cycle.
 */

export interface ToolProps {
  /**
   * Sends the tool's result into the conversation as a user turn.
   *
   * This is what keeps a tool from being a calculator bolted onto a chat page:
   * the number the user just worked out is the thing they actually wanted to ask
   * about, and making them retype it as a message is where they would leave.
   */
  onSend: (text: string) => void;
  /** False when no API key is configured. The send control is disabled. */
  ready: boolean;
  /** True while a turn is in flight — sending now would start a second stream. */
  busy: boolean;
}
