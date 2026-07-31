/**
 * Card content for Youphemism.
 *
 * `PHRASES` are everyday sayings that players redefine.
 * `CATEGORIES` are the absurd constraints that force the redefinition sideways.
 * `PROMPTS` are round-two story setups.
 *
 * Content is fan-made and intentionally original — it is not transcribed from
 * the published deck.
 */

export const PHRASES: string[] = [
  "break the ice",
  "spill the tea",
  "burn the midnight oil",
  "throw shade",
  "hit the hay",
  "bite the bullet",
  "read the room",
  "call it a night",
  "cut to the chase",
  "let the cat out of the bag",
  "under the weather",
  "piece of cake",
  "cost an arm and a leg",
  "back to square one",
  "pull yourself together",
  "beat around the bush",
  "the ball is in your court",
  "go down a rabbit hole",
  "jump the shark",
  "move the goalposts",
  "put a pin in it",
  "circle back",
  "take it with a grain of salt",
  "close but no cigar",
  "wing it",
  "ghost someone",
  "touch grass",
  "living rent free in my head",
  "main character energy",
  "chef's kiss",
  "caught in 4K",
  "the vibes are off",
  "sending me",
  "eat the frog",
  "boil the ocean",
  "low-hanging fruit",
  "shoot your shot",
  "hold my beer",
  "a hard pill to swallow",
  "burning bridges",
  "the elephant in the room",
  "pushing up daisies",
  "raining cats and dogs",
  "playing devil's advocate",
  "third wheel",
  "sunk cost",
  "keeping up appearances",
  "clout chasing",
  "a soft launch",
  "the walk of shame",
  "doomscrolling",
  "the Sunday scaries",
  "a hard reset",
  "a whole vibe",
  "delulu",
  "gatekeeping",
  "pulling an all-nighter",
  "putting out fires",
  "singing for your supper",
  "a shot in the dark",
];

export const CATEGORIES: string[] = [
  "a medieval punishment",
  "an Olympic sport",
  "a dating app red flag",
  "a haunted household appliance",
  "a corporate synergy initiative",
  "a forbidden dance move",
  "a smell you can't place",
  "an unlicensed medical procedure",
  "a bird's opinion of humans",
  "a crime committed in a grocery store",
  "a cursed cooking technique",
  "a genre of elevator music",
  "an alien's misunderstanding of Earth",
  "a wrestling finisher",
  "a passive-aggressive email tone",
  "a mandatory team-building exercise",
  "a bad tattoo",
  "an unhinged group chat rule",
  "a way to end a friendship",
  "a suspicious hobby",
  "a texture nobody enjoys",
  "a plumbing emergency",
  "a lie you tell a dentist",
  "a ritual performed at 3am",
  "an amenity at a terrible hotel",
  "a sound your car shouldn't make",
  "a moth's life goal",
  "a middle school talent show act",
  "a conspiracy about mailmen",
  "a snack invented by a villain",
  "an excuse for missing a wedding",
  "a superpower with a cruel drawback",
  "a menu item at a gas station",
  "a haircut that ruins lives",
  "a task in a cult onboarding packet",
  "a discontinued children's toy",
  "an ancient trade route",
  "a workout for one specific muscle",
  "a scent-based warning system",
  "a fashion trend among geese",
];

export const PROMPTS: string[] = [
  "Explain to your landlord why the bathtub is on the roof.",
  "Deliver a best-man speech that slowly reveals a crime.",
  "Write the one-star review that ended a restaurant.",
  "Narrate a nature documentary about your own household.",
  "Give a TED Talk on why your last job fired you.",
  "Testify in court about what happened at the county fair.",
  "Write the group chat apology that made everything worse.",
  "Pitch a reality show set entirely inside a laundromat.",
  "Explain a three-hour gap in your alibi.",
  "Write the safety briefing for a haunted cruise ship.",
  "Tell your grandkids how you met your nemesis.",
  "Report live from the scene of a very small disaster.",
  "Write the resignation letter you'd never actually send.",
  "Describe the worst road trip in recorded history.",
  "Explain to a doctor how you got like this.",
  "Give the halftime speech for a losing bowling team.",
  "Write the museum plaque for an extremely cursed object.",
  "Recount the wedding toast that started a family feud.",
  "Narrate the security footage from 4:57am.",
  "Write the voicemail that got you uninvited to Thanksgiving.",
  "Explain the origin of your town's strangest holiday.",
  "Write the closing argument in the trial of a raccoon.",
  "Give a guided tour of the worst apartment in the city.",
  "Describe the moment your streak of good luck ended.",
];

export interface Deck {
  phrases: { id: string; text: string }[];
  categories: { id: string; text: string }[];
  prompts: { id: string; text: string }[];
}

function index(items: string[], prefix: string) {
  return items.map((text, i) => ({ id: `${prefix}${i}`, text }));
}

export const DECK: Deck = {
  phrases: index(PHRASES, "p"),
  categories: index(CATEGORIES, "c"),
  prompts: index(PROMPTS, "s"),
};

const phraseById = new Map(DECK.phrases.map((c) => [c.id, c]));
const categoryById = new Map(DECK.categories.map((c) => [c.id, c]));
const promptById = new Map(DECK.prompts.map((c) => [c.id, c]));

export const getPhrase = (id: string) => phraseById.get(id);
export const getCategory = (id: string) => categoryById.get(id);
export const getPrompt = (id: string) => promptById.get(id);
