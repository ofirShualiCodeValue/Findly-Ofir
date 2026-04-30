import CoreOTPCredentialSet from '@monkeytech/nodejs-core/authentication/models/otp/OTPCredentialSet';

import config from '../../../config/auth/spec';

export class OTPCredentialSet extends CoreOTPCredentialSet {

}

OTPCredentialSet.config = config;