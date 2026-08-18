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
        'Where consent is required, these technologies should not activate until appropriate consent is received.',
      ),
    ]),
    section('7', '7. Third-Party Technologies', [
      p('FlacronCV may use service-provider technologies supporting:'),
      ul([
        'Firebase',
        'Stripe',
        'Analytics',
        'Authentication',
        'Error monitoring',
        'Hosting',
        'Security',
      ]),
      p(
        'The production Cookie Policy should be updated to reflect the technologies actually deployed.',
      ),
    ]),
    section('8', '8. Cookie Consent Banner', [
      p('Implement a cookie banner with:'),
      ul(['Accept All', 'Reject Non-Essential', 'Manage Preferences']),
      p('Do not hide or significantly obscure the rejection option.'),
    ]),
    section('9', '9. Cookie Preference Center', [
      p('Strictly Necessary'),
      p('Always Active'),
      p('Required for account authentication, security, fraud prevention, billing, and basic operation.'),
      p('Preferences'),
      p('Toggle:'),
      p('On / Off'),
      p('Allows FlacronCV to remember settings such as language and theme.'),
      p('Analytics'),
      p('Toggle:'),
      p('On / Off'),
      p('Allows FlacronCV to understand service usage and improve performance.'),
      p('Buttons:'),
      ul(['Save Preferences', 'Accept All', 'Reject Non-Essential']),
    ]),
    section('10', '10. Changing Cookie Choices', [
      p('Users should be able to update their choices later.'),
      p('Add a permanent footer control:'),
      p('Cookie Preferences'),
      p('Selecting this option should reopen the consent manager.'),
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
        'Where legally required and technically applicable, FlacronCV should evaluate recognized browser-based privacy signals.',
      ),
    ]),
    section('13', '13. Changes to This Cookie Policy', [
      p('We may update this Cookie Policy as technologies or service providers change.'),
      p('The current version should always display its latest update date.'),
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
      p('Parent Company Email: Contact@flacronenterprises.com'),
      p('Powered by Flacron Engine'),
    ]),
  ],
};
