import AuthConfig, { AuthConfigSpec } from '@monkeytech/nodejs-core/authentication/config/base';

import { coreModels } from './core';

import defaultConfig from './default';

import OTPConfig from './otp/default';
import SMSOTPConfig from './otp/sms';

const spec: AuthConfigSpec = {
    CredentialSet: { default: defaultConfig },
    OTPCredentialSet: { default: OTPConfig },
    SMSOTPCredentialSet: { default: SMSOTPConfig },
};

const config = new AuthConfig(spec);

// setup parent model configuration (these are used directly from the core, without inheritance)
// implementation-specific configuration is assigned at the respective model level
for (let model of coreModels) {
    model.config = config;
}

export default config;
