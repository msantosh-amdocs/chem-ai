import { Avatar, type AvatarSize } from "../sandbox";
import type { AgentAccent } from "../connector/personas";

interface Props {
  persona: {
    name: string;
    avatarId: string;
    accent: AgentAccent;
  };
  size?: AvatarSize;
  ring?: boolean;
  className?: string;
}

/**
 * Business-layer adapter: takes a domain SpecialistPersona (or snapshot with
 * the same shape) and forwards to the sandbox `Avatar` primitive. Lets pages
 * pass personas around without duplicating the persona-to-Avatar mapping and
 * keeps `sandbox/Avatar` domain-free.
 */
export function SpecialistAvatar({ persona, size, ring, className }: Props) {
  return (
    <Avatar
      name={persona.name}
      portraitId={persona.avatarId}
      solidClass={persona.accent.solid}
      ringClass={persona.accent.ring}
      size={size}
      ring={ring}
      className={className}
    />
  );
}
