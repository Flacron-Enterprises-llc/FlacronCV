import {
  LEGAL_LAST_UPDATED,
  LEGAL_VERSION,
  type LegalDocument,
  p,
  ul,
  section,
} from './types';

/**
 * Cookie Policy body. §6 Marketing is omitted (no advertising technology).
 * The §2 bullet "Support marketing where permitted" is held pending the client.
 * Marketing is also omitted from the §7 third-party list and the §9 preference
 * center. Original section numbers are kept (1–5, then 7–14).
 */
export const COOKIES: LegalDocument = {
  id: 'cookies',
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  path: '/cookie-policy',
  title: 'FlacronCV Cookie Policy',
  description:
    'This Cookie Policy explains how FlacronCV, operated by Flacron Enterprises, may use cookies and similar technologies.',
  preamble: [
    p(
      'This Cookie Policy explains how FlacronCV, operated by Flacron Enterprises, may use cookies and similar technologies.',
    ),
  ],
  sections: [
    section('1', '1. What Are Cookies?', [
      p("Cookies are small data files that websites may store on a user's browser or device."),
      p('Similar technologies may include:'),
      ul([
        'Local storage',
        'Session storage',
        'Pixels',
        'SDKs',
        'Device identifiers',
        'Security identifiers',
        'Similar browser technologies',
      ]),
    ]),
    section('2', '2. Why We Use Cookies', [
      p('FlacronCV may use cookies and similar technologies to:'),
      ul([
        'Keep users logged in',
        'Authenticate accounts',
        'Maintain security',
        'Prevent fraud',
        'Enforce usage restrictions',
        'Remember preferences',
        'Maintain subscription sessions',
        'Remember language',
        'Remember theme',
        'Understand service performance',
        'Detect errors',
        'Analyze usage',
        'Store cookie-consent preferences',
      ]),
    ]),
    section('3', '3. Strictly Necessary Technologies', [
      p('These may be required to provide essential functionality.'),
      p('Examples include:'),
      ul([
        'Authentication',
        'Security',
        'Session management',
        'Billing sessions',
        'Fraud prevention',
        'Free Plan abuse protection',
        'Load balancing',
        'Consent preferences',
      ]),
      p(
        'Strictly necessary technologies may remain active where legally permitted because they are required to provide requested functionality.',
      ),
    ]),
    section('4', '4. Preference Technologies', [
      p('Preference technologies may remember choices such as:'),
      ul(['Dark Mode', 'Light Mode', 'Language', 'Display preferences', 'User settings']),
    ]),
    section('5', '5. Analytics Technologies', [
      p('Analytics technologies may help us understand:'),
      ul([
        'Visitor numbers',
        'Page views',
        'Traffic sources',
        'Application usage',
        'Feature engagement',
        'Performance',
        'Conversion rates',
        'Technical problems',
      ]),
      p(
        'These technologies are not activated until you allow the Analytics category.',
      ),
    ]),
    section('7', '7. Third-Party Technologies', [
      p('FlacronCV uses the following service providers, which may store or read information on your device:'),
      ul([
        'Google Firebase (Google LLC) — account sign-in, authentication sessions and security. Strictly necessary.',
        'Stripe (Stripe, Inc.) — payment processing and fraud prevention, loaded only when you start a checkout or manage billing. Strictly necessary for payments.',
        'Flacron Growth Engine (Flacron Enterprises) — product analytics and the in-app support chat. It stores a pseudonymous visitor identifier in the local storage of your browser and records pages viewed and product events. When you are signed in, it may also be linked to your account. Loaded only if you allow Analytics.',
        'Google Analytics 4 (Google LLC), where enabled — aggregated usage statistics. It sets first-party cookies such as _ga. Loaded only if you allow Analytics.',
        'Our hosting and content-delivery providers — delivering the website securely. They do not store tracking identifiers on your device.',
      ]),
      p('We do not use advertising, retargeting or marketing cookies.'),
      p('This list reflects the technologies currently in use and is updated when they change.'),
    ]),
    section('8', '8. Cookie Consent Banner', [
      p('When you first visit FlacronCV, a cookie banner asks for your choice. It offers three options of equal prominence:'),
      ul([
        'Accept All — allows Preferences and Analytics technologies.',
        'Reject Non-Essential — allows only strictly necessary technologies.',
        'Manage Preferences — opens the preference center so you can choose each category.',
      ]),
      p('Until you make a choice, only strictly necessary technologies are used. Analytics technologies, including the Flacron Growth Engine and its support chat, are not loaded before you allow them.'),
    ]),
    section('9', '9. Cookie Preference Center', [
      p('The preference center lists each category with a description:'),
      ul([
        'Strictly Necessary — always active. Required for account authentication, security, fraud prevention, billing, recording your cookie choice, and basic operation.',
        'Preferences — off unless you turn it on. Lets FlacronCV remember settings such as language, theme and sidebar layout. If you turn it off, the stored settings are deleted from your browser.',
        'Analytics — off unless you turn it on. Lets FlacronCV understand how the service is used and improve it, through the Flacron Growth Engine (including its support chat) and, where enabled, Google Analytics 4.',
      ]),
      p('You can save your selection, accept all categories, or reject all non-essential categories from the preference center.'),
    ]),
    section('10', '10. Changing Cookie Choices', [
      p('You can change your choices at any time by selecting "Cookie Preferences" in the website footer, or in your account area, which reopens the preference center.'),
      p('If you withdraw consent for Analytics, the analytics technologies stop running and are not loaded again; the page reloads where needed so that scripts already running are removed. Information already collected is handled as described in our Privacy Policy.'),
    ]),
    section('11', '11. Browser Controls', [
      p('Users may also use browser settings to:'),
      ul(['Block cookies', 'Delete cookies', 'Limit tracking']),
      p(
        'Blocking technologies required for account or security functions may prevent portions of FlacronCV from functioning correctly.',
      ),
    ]),
    section('12', '12. Privacy Signals', [
      p(
        'Where legally required and technically applicable, FlacronCV will honor recognized browser-based privacy signals.',
      ),
    ]),
    section('13', '13. Changes to This Cookie Policy', [
      p('We may update this Cookie Policy as technologies or service providers change.'),
      p('The date at the top of this policy shows when it was last updated.'),
    ]),
    section('14', '14. Contact', [
      p('Questions about cookies or privacy may be submitted to:'),
      p('FlacronCV'),
      p('Operated by Flacron Enterprises'),
      p('410 E 95th St'),
      p('Brooklyn, NY 11212'),
      p('United States'),
      p('Phone: 929-990-1182'),
      p('FlacronCV Email: contact@flacroncv.com'),
      p('Parent Company Email: contact@flacronenterprises.com'),
      p('Powered by Flacron Engine'),
    ]),
  ],
};
