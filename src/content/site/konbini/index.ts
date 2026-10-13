// The ひかりマート site: the store, its front lot, its back yard, banner slots and seasonal decorations.
// Every mod here is tagged site: 'konbini' — choose another site in the app config to swap the whole set.
import store from './store';
import frontage from './frontage';
import backyard from './backyard';
import banners from './banners';
import seasonal from './seasonal';

export const konbiniSite = [store, frontage, backyard, banners, seasonal];
export type { ShopService, BackyardService, BannerService } from './api';
