/**
 * A derived interest chip shown on the profile. Unlike the broad fixed `topics`
 * ids, an interest is a *real* Wikipedia category common to several articles the
 * user kept — so its granularity adapts to what they actually read: a focused
 * run on French kings yields "Histoire de France", while medieval pages spread
 * across countries climb to a shared ancestor like "Moyen Âge".
 */
export interface Interest {
  /** Full Wikipedia category title (e.g. "Catégorie:Roi de France") — stable mute key. */
  id: string;
  /** Display label: the category name with its localized prefix stripped. */
  label: string;
}
