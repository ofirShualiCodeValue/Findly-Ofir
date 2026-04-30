import CoreCredentailSet from '@monkeytech/nodejs-core/authentication/models/CredentialSet';
import CoreOTPCredentialSet from '@monkeytech/nodejs-core/authentication/models/otp/OTPCredentialSet';
import CorePasswordCredentialSet from '@monkeytech/nodejs-core/authentication/models/password/PasswordCredentialSet';
import CoreTimeBasedOTPCredentialSet from '@monkeytech/nodejs-core/authentication/models/otp/TimeBasedOTPCredentialSet';
import CoreChallengeBasedOTPCredentialSet from '@monkeytech/nodejs-core/authentication/models/otp/ChallengeBasedOTPCredentialSet';

export const coreModels = [
    CoreCredentailSet,
    CoreOTPCredentialSet,
    CorePasswordCredentialSet,
    CoreTimeBasedOTPCredentialSet,
    CoreChallengeBasedOTPCredentialSet
];
