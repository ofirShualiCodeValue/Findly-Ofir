import defaultConfig from './default';
import { iSMSOTPAuthConfigOptions } from '@monkeytech/nodejs-core/authentication/config/otp';
import { MockSMSGateway } from './MockSMSGateway';
import { SimpleTemplate } from './template';

const mockGateway = new MockSMSGateway();

const config: iSMSOTPAuthConfigOptions = {
    ...defaultConfig,
    smsGateway: {
        IL: mockGateway,
    },
    messageTemplate: new SimpleTemplate('קוד האימות שלך ב-Findly: {otp}'),
    defaultCountryCode: 'IL'
};

export default config;