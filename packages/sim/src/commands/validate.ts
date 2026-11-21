import { validateCommandShape, type Command } from '@reinos/shared';

/**
 * A command is executable in this turn when it is well-formed, its player exists in this match
 * and it targets exactly the current turn (ADR-005 §5.2). Anything else is rejected whole.
 */
export function isExecutable(c: unknown, turn: number, maxPlayers: number): c is Command {
  return validateCommandShape(c) && c.turn === turn && c.playerId < maxPlayers;
}
