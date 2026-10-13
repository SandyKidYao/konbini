// Every built-in mod. The app loads these plus any external ones; site mods only load for the active site.
import library from './library';
import { worldMods } from './world';
import { konbiniSite } from './site/konbini';
import { eventMods } from './events';

export const builtinMods = [library, ...worldMods, ...konbiniSite, ...eventMods];
