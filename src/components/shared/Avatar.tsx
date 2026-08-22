// The web half of iOS's AvatarCircle (ios/CampOps/Views/Shared/AvatarCircle.swift) — same
// sage circle, same forest initials, so a person is recognisable at a glance on either client.
//
// A name chip is text you have to read; a coloured circle is something you recognise. In a list
// of twenty issues that difference is what makes the board scan as "everything has an owner"
// rather than as a spreadsheet.

import { initialsFor } from '@/lib/utils';

interface Props {
  /** Full name; initials are derived. */
  name: string;
  size?: number;
}

export function Avatar({ name, size = 22 }: Props) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-sage-light border border-sage/35 text-forest font-semibold flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      title={name}
      aria-hidden
    >
      {initialsFor(name)}
    </span>
  );
}
