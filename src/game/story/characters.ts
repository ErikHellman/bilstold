/** A gang boss: who phones you, how they talk, and what their portrait looks like. */
export interface Boss {
  name: string;
  /** How they open a call. */
  hello: string;
  /** How they sign off after a job well done. */
  thanks: string;
  /** Portrait traits for the generated face. */
  look: { hair: 'bald' | 'short' | 'long' | 'mohawk' | 'cap'; shades: boolean; beard: boolean; skin: number };
}

/** Bosses keyed by the first part of the gang name (see world/gangnames.ts). */
export const BOSSES: Record<string, Boss> = {
  Söder: { name: 'Mamma Mia Söderberg', hello: 'Hörru, sweetheart. Mamma has a job.', thanks: 'Good kid. Mamma is proud.', look: { hair: 'long', shades: false, beard: false, skin: 1 } },
  Hamn: { name: 'Kapten Krok', hello: 'Ahoy. The tide waits for no one.', thanks: 'Smooth sailing. Have a herring on me.', look: { hair: 'cap', shades: false, beard: true, skin: 2 } },
  Norr: { name: 'Frost-Fredrik', hello: 'Cold day. Colder business.', thanks: 'Ice cold. I like that.', look: { hair: 'short', shades: true, beard: true, skin: 0 } },
  Rost: { name: 'Rosti Rostberg', hello: 'Everything rusts. Except loyalty. Listen.', thanks: 'Solid work. Not a scratch of rust on you.', look: { hair: 'mohawk', shades: false, beard: false, skin: 1 } },
  Järn: { name: 'Järn-Jonna', hello: 'No small talk. Here is the job.', thanks: 'Hard as iron. Keep it that way.', look: { hair: 'short', shades: true, beard: false, skin: 3 } },
  Svart: { name: 'Herr Svart', hello: 'You do not know my face. Keep it that way.', thanks: 'Discreet. Efficient. Acceptable.', look: { hair: 'bald', shades: true, beard: false, skin: 2 } },
  Guld: { name: 'Guld-Gunnar', hello: 'Money never sleeps, and neither do I!', thanks: 'Ka-ching! That is the sound of you being useful.', look: { hair: 'short', shades: true, beard: true, skin: 0 } },
  Neon: { name: 'Nova Neon', hello: 'Hiii followers! Just kidding, it is you. Content time!', thanks: 'Iconic. Literally going viral.', look: { hair: 'long', shades: true, beard: false, skin: 1 } },
  Is: { name: 'Isa Isberg', hello: 'Listen carefully. I will only say this once.', thanks: 'Clean. Cold. Perfect.', look: { hair: 'long', shades: false, beard: false, skin: 0 } },
  Krom: { name: 'Krom-Kurt', hello: 'Shine your shoes, we have work.', thanks: 'Polished. You shine, kid.', look: { hair: 'mohawk', shades: true, beard: true, skin: 3 } },
};

const FALLBACK: Boss = { name: 'The Boss', hello: 'Got a job for you.', thanks: 'Nice work.', look: { hair: 'short', shades: true, beard: false, skin: 1 } };

/** The boss of a gang, found from the start of its name. */
export function bossFor(gangName: string): Boss {
  for (const [prefix, b] of Object.entries(BOSSES)) if (gangName.startsWith(prefix)) return b;
  return FALLBACK;
}
