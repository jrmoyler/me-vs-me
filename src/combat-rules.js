export const SPECIAL_COST = 35;
const stat = value => Math.max(1, Math.min(10, Number(value) || 5));
export function specialVariant(character) {
  const identity = `${character.id} ${character.name} ${character.move}`;
  if (/gauntlet|blast|hataalii/i.test(identity)) return 3;
  if (/kick|sweep/i.test(identity)) return 2;
  if (/shoulder|elbow/i.test(identity)) return 1;
  return [...String(character.id || character.name)].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
}
export function createAttack(fighter, type) {
  if (fighter.attack || fighter.cooldown > 0 || fighter.stun > 0 || fighter.guard) return null;
  if (type === 'special' && fighter.energy < SPECIAL_COST) return null;
  const moves = {
    light: { damage: 7, reach: 110, start: .09, active: .14, duration: .34 },
    medium: { damage: 10, reach: 121, start: .16, active: .14, duration: .46 },
    kick: { damage: 8, reach: 129, start: .12, active: .14, duration: .39 },
    mediumKick: { damage: 11, reach: 143, start: .18, active: .15, duration: .51 },
    heavyKick: { damage: 15, reach: 158, start: .24, active: .16, duration: .67 },
    heavy: { damage: 13, reach: 135, start: .2, active: .15, duration: .59 },
    special: { damage: 22, reach: 220, start: .23, active: .23, duration: .86 },
  };
  if (!moves[type]) return null;
  const variant = specialVariant(fighter.c);
  if (type === 'special') Object.assign(moves.special, [
    { damage: 22, reach: 225, start: .23 },
    { damage: 24, reach: 125, start: .18 },
    { damage: 20, reach: 155, start: .15 },
    { damage: 19, reach: 280, start: .32 },
  ][variant]);
  const move = { ...moves[type], type, t: 0, hit: false, variant };
  move.start = Math.max(move.start, move.duration * .43);
  return move;
}
export function inMeleeRange(attacker, target, move) {
  if (move.type === 'special' && move.variant === 3) return false;
  const dx = target.x - attacker.x;
  return dx * attacker.face >= 0 && Math.abs(dx) < move.reach + stat(attacker.c.reach) * 3 && Math.abs(target.y - attacker.y) < (target.crouch ? 85 : 120);
}
export function hitOutcome(attacker, target, move) {
  const blocking = Boolean(target.guard && target.face === -attacker.face);
  const damage = move.damage * (.88 + stat(attacker.c.power) * .025) * (blocking ? .16 : 1);
  return { blocking, damage, health: Math.max(0, target.hp - damage), energy: Math.min(100, attacker.energy + (blocking ? 3 : 8)), knockback: blocking ? 9 : move.type === 'special' ? 35 : 18, stun: blocking ? .04 : move.type === 'special' ? .28 : .15 };
}
export function roundOutcome(player, opponent) {
  const winner = player.hp === opponent.hp ? null : player.hp > opponent.hp ? 'player' : 'opponent';
  const playerRounds = player.rounds + (winner === 'player' ? 1 : 0);
  const opponentRounds = opponent.rounds + (winner === 'opponent' ? 1 : 0);
  return { winner, playerRounds, opponentRounds, complete: playerRounds >= 2 || opponentRounds >= 2 };
}
