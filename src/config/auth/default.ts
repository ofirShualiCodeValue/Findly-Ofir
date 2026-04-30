import { Duration } from 'luxon';
import { iAuthConfigOptions } from '@monkeytech/nodejs-core/authentication/config/base';

/**
 * The following file specifies the default configuration options for the authentication module.
 * [WARNING] Changing these values can impact the overall security of the system; Handle with care.
 */
const config: iAuthConfigOptions = {
    sidByteLength: 10, 
	secretByteLength: 5,
	tokenByteLength: 48,

    suspendedOwnerStatuses: ['inactive'],

	confirmable: false, 
	confirmWithin: Duration.fromObject({ hours: 48 }),
	reconfirmable: false,

	lockable: true,
	maximumAttempts: 5,
    unlockStrategy: 'both',
	unlockIn: Duration.fromObject({ minutes: 15 }),
	unlockWithin: Duration.fromObject({ hour: 1 }),

	expirable: false,
	expireSecretAfter: Duration.fromObject({ months: 6 }),
	expireSupportSecretAfter: Duration.fromObject({ hours: 8 }),

	denyOldSecrets: true,
	secretsArchivingCount: 3,

	resetSecretWithin: Duration.fromObject({ minutes: 30 }),

	defaultLocale: 'he'
};

export default config;