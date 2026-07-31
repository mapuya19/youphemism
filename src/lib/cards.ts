/**
 * Card content for Youphemism.
 *
 * - `YOUPHEMISMS` are ordinary things — the nouns players redefine. Round 1
 *   deals five of these to each player, and they choose which one to play.
 * - `CATEGORIES` are what the judge reveals; a played card must be redefined as
 *   a member of that category ("Ikea is the senior prank where…").
 * - `USE_ITS` are round 2 story openers.
 *
 * Content is original fan-made writing, not transcribed from the retail deck.
 */

export const YOUPHEMISMS: string[] = [
  "hot dog", "Ikea", "musical chairs", "clown car", "bald eagle", "zoo exhibit",
  "bagpiping", "jury duty", "the Wi-Fi password", "a group project",
  "leaf blower", "hot yoga", "the DMV", "a trust fall", "speed bump",
  "karaoke night", "a bounce house", "the buffet", "jet lag", "a fire drill",
  "the fog machine", "a lazy river", "escape room", "the aux cord",
  "a paper shredder", "the salad bar", "bumper cars", "a leaf pile",
  "the ball pit", "a lint roller", "spin class", "the gutter",
  "a fun size candy bar", "the snooze button", "a revolving door",
  "the kids table", "a slip and slide", "the vending machine", "a hall pass",
  "the mall Santa", "a sleeper sofa", "an ice sculpture", "the drive-thru",
  "a piñata", "the ferris wheel", "a hot tub", "the recycling bin",
  "a walkie talkie", "the fire pole", "a lava lamp", "an inflatable mattress",
  "the sprinkler", "a car wash", "the emergency exit", "a bubble bath",
  "the dishwasher", "a hedge maze", "the pool noodle", "a wheelbarrow",
  "the trampoline", "a rotisserie chicken", "the elliptical",
  "a two-for-one deal", "the parking garage", "a hand dryer",
  "the deep fryer", "a fitted sheet", "the wind chime", "a shopping cart",
  "the sauna", "a paper cut", "the dog park", "a stress ball",
  "the golf cart", "a jigsaw puzzle", "the recliner", "a mall kiosk",
  "the batting cage", "a lint trap", "the fondue pot", "a corn maze",
  "the intercom", "a boombox", "the panic button", "a lazy Susan",
  "the crockpot", "a fun run", "the ice machine", "a bean bag chair",
  "the pothole", "a fanny pack", "the tanning bed", "a nightlight",
  "the fire escape", "a plunger", "the sunroof", "a diving board",
  "the mascot", "a leaf skeleton", "the mosh pit", "a moving truck",
  "the laundromat", "a pop-up tent", "the crosswalk", "a whoopee cushion",
];

export const CATEGORIES: string[] = [
  "senior pranks",
  "a way to break up with someone",
  "a bad first date",
  "an unhinged workout",
  "a haircut nobody asked for",
  "a way to get out of jury duty",
  "a suspicious side hustle",
  "a middle school talent show act",
  "a wedding tradition",
  "an excuse for being late",
  "a cursed cooking technique",
  "a way to quit your job",
  "a medieval punishment",
  "an Olympic event",
  "a dating app red flag",
  "a mandatory team-building exercise",
  "a way to apologise",
  "a family holiday tradition",
  "a haunted household chore",
  "a way to make an entrance",
  "a bad tattoo",
  "an unlicensed medical procedure",
  "a way to get fired",
  "a forbidden dance move",
  "a corporate synergy initiative",
  "a crime committed in a grocery store",
  "a way to win an argument",
  "a rejected Olympic sport",
  "a very specific fear",
  "a way to flirt badly",
  "an amenity at a terrible hotel",
  "a passive-aggressive gesture",
  "a way to celebrate a promotion",
  "a rite of passage",
  "a discontinued children's toy",
  "a menu item at a gas station",
  "a way to ruin a road trip",
  "a task in a cult onboarding packet",
  "a way to get banned from a library",
  "an emergency contact's worst nightmare",
  "a bachelor party activity",
  "a way to intimidate a coworker",
  "a scandal at a bake sale",
  "a summer camp activity",
  "a way to be a bad neighbour",
  "a reality TV challenge",
  "a way to lose a friendship",
  "a haunted amusement park ride",
  "a wellness trend",
  "a way to get out of a group chat",
];

export const USE_ITS: string[] = [
  "I went to the emergency room",
  "My small town is famous for",
  "I spent the day with Grandma",
  "My hot take",
  "The worst part of my job",
  "How I got this scar",
  "A defining moment in my childhood",
  "Why I'm never invited back",
  "My most controversial opinion",
  "The reason I moved away",
  "What ruined my wedding",
  "How I met my nemesis",
  "The strangest thing in my hometown",
  "Why the police were called",
  "My biggest regret",
  "What I do to unwind",
  "The reason I don't drive any more",
  "How my band broke up",
  "Why I got kicked out of the group chat",
  "The night I don't talk about",
  "What my therapist and I discussed",
  "My grandfather's dying wish",
  "The worst gift I've ever received",
  "How I became a local legend",
  "Why I stopped going to the gym",
  "The thing my family never mentions",
  "What happened at the county fair",
  "How my road trip ended",
  "Why I'm suing my landlord",
  "My proudest achievement",
  "The reason there's a hole in my ceiling",
  "What I found in the attic",
];

export interface Card {
  id: string;
  text: string;
}

function index(items: string[], prefix: string): Card[] {
  return items.map((text, i) => ({ id: `${prefix}${i}`, text }));
}

export const DECK = {
  youphemisms: index(YOUPHEMISMS, "y"),
  categories: index(CATEGORIES, "c"),
  useIts: index(USE_ITS, "u"),
} as const;

const byId = (cards: readonly Card[]) => new Map(cards.map((c) => [c.id, c]));

const youphemismById = byId(DECK.youphemisms);
const categoryById = byId(DECK.categories);
const useItById = byId(DECK.useIts);

export const getYouphemism = (id: string) => youphemismById.get(id);
export const getCategory = (id: string) => categoryById.get(id);
export const getUseIt = (id: string) => useItById.get(id);

export const textOf = (
  lookup: (id: string) => Card | undefined,
  id: string,
): string => lookup(id)?.text ?? id;
