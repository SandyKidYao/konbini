// Events: the scripts that bring the scene to life. Each is a mod; most register a weighted
// event with the director, a few (clerk, banners, taxi) run continuously.
import { clerkMod, customerMod, staffBreakMod, bannersMod } from './shop-life';
import { passersbyMod, touristsMod, taxiMod } from './street-life';

export const eventMods = [clerkMod, customerMod, staffBreakMod, bannersMod, passersbyMod, touristsMod, taxiMod];
