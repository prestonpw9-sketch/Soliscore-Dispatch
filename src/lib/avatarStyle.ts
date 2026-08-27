/** Vibrant avatar gradients keyed off a name so each crew member stays consistent. */
const AVATAR_GRADIENTS = [
  'bg-gradient-to-br from-fuchsia-400 via-violet-500 to-indigo-700',
  'bg-gradient-to-br from-cyan-300 via-sky-500 to-blue-700',
  'bg-gradient-to-br from-lime-300 via-emerald-500 to-teal-700',
  'bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600',
  'bg-gradient-to-br from-rose-300 via-pink-500 to-fuchsia-700',
  'bg-gradient-to-br from-sky-300 via-indigo-500 to-violet-800',
] as const;

export function avatarGradientClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
