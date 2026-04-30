import { LocalizedString } from '@monkeytech/nodejs-core/i18n/LocalizedString';

/**
 * Drop-in replacement for `LocalizedString` that does not rely on the i18n
 * package being configured. core's stock `LocalizedString` calls i18n.__()
 * which crashes with "logDebugFn is not a function" when i18n hasn't been
 * configured with locales/directory. We don't ship locale files, so we just
 * substitute placeholders manually.
 */
export class SimpleTemplate extends LocalizedString {
  private readonly template: string;

  constructor(template: string) {
    super(template);
    this.template = template;
  }

  override toString(_locale?: string, data?: Record<string, unknown>): string {
    let out = this.template;
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        const value = v === null || v === undefined ? '' : String(v);
        out = out.split(`{{${k}}}`).join(value).split(`{${k}}`).join(value);
      }
    }
    return out;
  }
}
