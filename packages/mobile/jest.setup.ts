/**
 * Runs before every test file. Initialises i18n (bundled catalogs) and pins
 * it to pt-BR, whatever the machine's or the expo-localization mock's
 * language, so existing Portuguese assertions keep passing. A test that
 * needs English calls `i18n.changeLanguage('en-US')` (synchronous here) and
 * switches back in `afterEach`, or passes `{ locale: 'en-US' }` to the format
 * helpers.
 */
import { i18n } from './src/i18n';

void i18n.changeLanguage('pt-BR');
if (i18n.language !== 'pt-BR') throw new Error('jest.setup: i18n did not switch to pt-BR synchronously');
