import CoreToken from '@monkeytech/nodejs-core/authentication/models/Token';

export class Token extends CoreToken {

}

/**
 * --- Uncomment to enable caching (recommended) ---
 * import { cacheProvider } from '../../../config/initializers/cache';
 * Token.cachePrefix = 'tkn';
 * Token.cacheProvider = cacheProvider;
 */