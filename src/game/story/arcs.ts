import type { MissionKind } from '../missions/templates';

/**
 * One scripted job in a gang's storyline. Text may use {gang}, {rival}, {rivalBoss}, {car} and {count};
 * the generator fills them in for the city at hand.
 */
export interface StoryStep {
  kind: MissionKind;
  title: string;
  brief: string[];
  /** Said on the pager when the job is done. */
  outro: string;
  /** Job-specific choice the generator honours (for example which car to steal). */
  car?: 'gang' | 'rival' | 'police' | 'swat' | 'icecream' | 'sports';
}

/** Five-job storylines; gang slot N of a city plays ARCS[N]. */
export const ARCS: StoryStep[][] = [
  [
    {
      kind: 'deliverCar', car: 'sports', title: 'Audition: bring a {car} to the garage',
      brief: ['New in town? Then you need to prove you can drive.', 'Bring me a {car} without a scratch on it.'],
      outro: 'Nice wheels. You might be worth something.',
    },
    {
      kind: 'destroyVehicles', car: 'rival', title: 'Wreck {count} {rival} cars',
      brief: ['{rival} cars have been cruising our streets like they own them.', 'Wreck {count} of them. Send a message.'],
      outro: 'They felt that. Good.',
    },
    {
      kind: 'escort', title: 'Drive the accountant to safety',
      brief: ['My accountant knows where every krona is buried.', '{rival} want him dead. Pick him up and get him across town in one piece.'],
      outro: 'He is safe, and so are my books.',
    },
    {
      kind: 'defend', title: 'Hold the warehouse against {rival}',
      brief: ['{rival} are coming for our warehouse tonight.', 'Stand your ground until the clock runs out. Do not let them push you out.'],
      outro: 'The warehouse is still ours. Because of you.',
    },
    {
      kind: 'assassinate', title: "Take out {rivalBoss}'s right hand",
      brief: ['Enough. {rivalBoss} has been laughing at us for too long.', 'Their right hand is out on the street with bodyguards. End it.'],
      outro: 'This city is ours now. You are family.',
    },
  ],
  [
    {
      kind: 'checkpoint', title: 'Learn the getaway route',
      brief: ['A good job starts with a good getaway.', 'Hit every checkpoint before the clock runs out. Learn these streets.'],
      outro: 'Fast hands. You will do.',
    },
    {
      kind: 'heat', title: 'Get three stars, then lose them',
      brief: ['I need to know how you handle the cops.', 'Get them really angry, three stars, then shake them off.'],
      outro: 'Slippery. Exactly what I need.',
    },
    {
      kind: 'chase', car: 'rival', title: 'Stop the {rival} courier',
      brief: ['A {rival} courier is carrying cash across town right now.', 'Run them down before they get away.'],
      outro: 'Their cash is our cash. Lovely.',
    },
    {
      kind: 'carBomb', title: 'Blow up the {rival} car',
      brief: ['{rivalBoss} rides in a {car} that has a meeting with a bomb.', 'Get it fitted at the bomb shop if you need to. Make it loud.'],
      outro: 'BOOM. They will be talking about that for weeks.',
    },
    {
      kind: 'deliverCar', car: 'swat', title: 'The big one: steal a {car}',
      brief: ['Now the big one. The police keep a {car} on the streets.', 'Take it and bring it to the garage. With it, no vault is safe.'],
      outro: 'With that van we are untouchable. Legend.',
    },
  ],
  [
    {
      kind: 'crush', title: 'Crush the evidence',
      brief: ['There is a body in the trunk of a {car}. Do not ask.', 'Find one and take it to the crusher. Evidence gone.'],
      outro: 'What body? Exactly.',
    },
    {
      kind: 'rampage', title: 'Show {rival} who runs this block',
      brief: ['{rival} have been tagging our walls.', 'Go and remind them who runs this block.'],
      outro: 'The walls are clean again. So to speak.',
    },
    {
      kind: 'chase', car: 'gang', title: 'Catch the snitch',
      brief: ['Somebody has been talking to the police.', 'The snitch just jumped into a car. Do not let them reach the station.'],
      outro: 'Snitches get stitches. Or worse.',
    },
    {
      kind: 'escort', title: 'Get my mother home',
      brief: ['My mother is in town and {rival} know it.', 'Drive her home. If she gets a single scratch, you get two.'],
      outro: 'Mamma says you drive like a maniac. She liked it.',
    },
    {
      kind: 'defend', title: 'Defend the clubhouse',
      brief: ['{rival} have declared war. They are coming to the clubhouse.', 'Hold the line until they give up.'],
      outro: 'We are still standing. They are not.',
    },
  ],
];

/** The city finale, opened once two storylines are done. */
export const FINALE: StoryStep = {
  kind: 'defend', title: 'Finale: the war for the city',
  brief: ['Every gang in the city wants your head now.', 'They are all coming at once. Survive, and the city is yours.'],
  outro: 'The city is yours. Nobody will ever forget it.',
};

/** Who phones you for the finale. */
export const FINALE_CALLER = 'Unknown caller';
