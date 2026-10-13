// Events: the scripts that bring the scene to life. Each is a mod; most register a weighted
// event with the director, a few (clerk, banners, traffic, parking, deliveries) run continuously.
import { clerkMod, customerMod, staffBreakMod, bannersMod } from './shop-life';
import { passersbyMod, touristsMod } from './street-life';
import { trafficMod, parkingMod, deliveryMod } from './traffic';

export const eventMods = [clerkMod, customerMod, staffBreakMod, bannersMod, passersbyMod, touristsMod, trafficMod, parkingMod, deliveryMod];
