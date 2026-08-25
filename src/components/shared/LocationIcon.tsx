import {
  Utensils, Stethoscope, BedDouble, Home, Wrench, Waves, Tent, Droplet, MapPin,
} from 'lucide-react';

/**
 * A location gets a glyph, not just a name.
 *
 * The list is scanned by people who know the property, and a shape is recognised faster than a
 * word is read, "the kitchen one" lands before "Kitchen" does. Matching is on substrings of
 * the location name because locations are camp-authored free text, not a fixed enum; anything
 * unrecognised falls back to a pin rather than guessing.
 *
 * The glyph is returned as an element rather than a component type: selecting a component
 * during render remounts it whenever the branch changes, and resets any state it holds.
 */
function glyphFor(location: string | undefined) {
  const cls = 'h-[19px] w-[19px]';
  if (!location) return <MapPin className={cls} />;
  if (/kitchen|dining|commissary|mess/i.test(location)) return <Utensils className={cls} />;
  if (/health|infirmary|medic|nurse/i.test(location)) return <Stethoscope className={cls} />;
  if (/cabin|bunk|dorm/i.test(location)) return <BedDouble className={cls} />;
  if (/lodge|office|hall|barn/i.test(location)) return <Home className={cls} />;
  if (/maintenance|shop|shed|garage/i.test(location)) return <Wrench className={cls} />;
  if (/waterfront|dock|lake|boat|beach/i.test(location)) return <Waves className={cls} />;
  if (/pool|bathhouse|shower|restroom|toilet/i.test(location)) return <Droplet className={cls} />;
  if (/field|court|athletic|trail|outdoor|ground/i.test(location)) return <Tent className={cls} />;
  return <MapPin className={cls} />;
}

export function LocationIcon({ location, className = '' }: { location?: string; className?: string }) {
  return (
    <span
      className={`grid h-9 w-9 flex-none place-items-center rounded-full border border-border bg-paper text-sage ${className}`}
      aria-hidden="true"
    >
      {glyphFor(location)}
    </span>
  );
}
