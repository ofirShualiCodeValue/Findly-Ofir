import CoreCredentialSet from '@monkeytech/nodejs-core/authentication/models/CredentialSet';

import config from '../../../config/auth/spec';

export class CredentialSet extends CoreCredentialSet {

}

CredentialSet.config = config;