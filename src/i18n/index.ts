export * from './th';
export { t as dict } from './th';

/**
 * Single locale for the MVP. The dictionary shape is the extension point:
 * add `en.ts` exporting the same shape, then resolve here from a cookie or
 * the LIFF language, and every component picks it up without changing.
 */
export const LOCALE = 'th-TH' as const;
export const TIME_ZONE = 'Asia/Bangkok' as const;
