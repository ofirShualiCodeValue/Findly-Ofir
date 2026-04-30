import defaultConfig from './default';
import { LocalizedString } from '@monkeytech/nodejs-core/i18n/LocalizedString';
import { iSMSOTPAuthConfigOptions } from '@monkeytech/nodejs-core/authentication/config/otp';

const config: iSMSOTPAuthConfigOptions = {
    ...defaultConfig,
    smsGateway: { },
    messageTemplate: new LocalizedString(``),
    defaultCountryCode: 'IL'
};

export default config;