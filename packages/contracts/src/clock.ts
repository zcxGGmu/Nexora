export interface Clock { readonly now: () => string }
export const systemClock: Clock = { now: () => new Date().toISOString() };
