/** Vibrant avatar gradients keyed off a name so each crew member stays consistent. */
const AVATAR_GRADIENTS = [
  'bg-gradient-to-br from-violet-500 to-fuchsia-400',
  'bg-gradient-to-br from-cyan-500 to-blue-500',
  'bg-gradient-to-br from-emerald-500 to-teal-400',
  'bg-gradient-to-br from-amber-500 to-orange-400',
  'bg-gradient-to-br from-rose-500 to-pink-400',
  'bg-gradient-to-br from-indigo-500 to-sky-400',
] as const;

export function avatarGradientClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
