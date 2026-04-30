import { Duration } from 'luxon';
import defaultConfig from '../default';
import { iOTPAuthConfigOptions } from '@monkeytech/nodejs-core/authentication/config/otp';

const config: iOTPAuthConfigOptions = {
	...defaultConfig,
	codeLength: 6,
	expireOtpAfter: Duration.fromObject({ minutes: 10 }),

	issuer: ``, 

	testCredentials: { }
};

export default config;