// The ひかりマート site: the store, its front lot, its back yard and banner slots.
// Every mod here is tagged site: 'konbini' — choose another site in the app config to swap the whole set.
import store from './store';
import frontage from './frontage';
import backyard from './backyard';
import banners from './banners';

export const konbiniSite = [store, frontage, backyard, banners];
export type { ShopService, BackyardService, BannerService } from './api';
