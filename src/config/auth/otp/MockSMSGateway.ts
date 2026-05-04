import { iSMSGateway } from '@monkeytech/nodejs-core/services/sms/types';

export class MockSMSGateway implements iSMSGateway {
  sendMessage(message: string, receiver: string): void {
    const banner = '━'.repeat(60);
    console.log(banner);
    console.log(`📱  MOCK SMS  →  ${receiver}`);
    console.log(`    ${message}`);
    console.log(banner);
  }
}
