import CoreSMSOTPCredentialSet from '@monkeytech/nodejs-core/authentication/models/otp/challenge/SMSOTPCredentialSet';

import config from '../../../config/auth/spec';

export class SMSOTPCredentialSet extends CoreSMSOTPCredentialSet {

}

SMSOTPCredentialSet.config = config;