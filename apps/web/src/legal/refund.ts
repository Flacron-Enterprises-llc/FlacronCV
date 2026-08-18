import {
  LEGAL_LAST_UPDATED,
  LEGAL_VERSION,
  type LegalDocument,
  p,
  ul,
  ol,
  section,
} from './types';

export const REFUND: LegalDocument = {
  id: 'refund',
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  path: '/refund-policy',
  title: 'FlacronCV Refund & Cancellation Policy',
  description:
    'This Refund and Cancellation Policy applies to paid FlacronCV subscriptions provided by Flacron Enterprises.',
  preamble: [
    p(
      'This Refund and Cancellation Policy applies to paid FlacronCV subscriptions provided by Flacron Enterprises.',
    ),
  ],
  sections: [
    section('1', '1. Subscription Plans', [
      p('FlacronCV may currently offer:'),
      p('Pro Plan'),
      p('$29.99/month'),
      p('Enterprise Plan'),
      p('$99.99/month'),
      p('Yearly pricing may also be available.'),
      p('Applicable taxes may be added where required.'),
      p('The final price displayed during checkout controls the purchase.'),
    ]),
    section('2', '2. Free Trials', [
      p('Eligible users may be offered a:'),
      p('7-day free trial'),
      p('The checkout screen must clearly disclose:'),
      ul([
        'Trial length',
        'Whether payment information is required',
        'Date paid billing begins',
        'Amount that will be charged',
        'Billing frequency',
        'How to cancel',
      ]),
    ]),
    section('3', '3. Recurring Billing', [
      p('Paid subscriptions are recurring unless clearly stated otherwise.'),
      p(
        'Unless canceled before the applicable renewal, the subscription may renew for another monthly or yearly billing period.',
      ),
    ]),
    section('4', '4. Canceling Your Subscription', [
      p('Users should be able to cancel through:'),
      p('Settings → Billing → Manage Subscription'),
      p('or through the applicable payment-provider portal.'),
      p('Cancel before your next renewal date if you do not want another subscription charge.'),
    ]),
    section('5', '5. Access After Cancellation', [
      p('Unless otherwise required by law, cancellation generally prevents future renewal.'),
      p('Paid access may remain available until the end of the already-paid billing period.'),
      p(
        'After paid access ends, the account may revert to the Free Plan or another available level of service.',
      ),
    ]),
    section('6', '6. General Refund Policy', [
      p(
        'Except where required by applicable law or expressly stated otherwise, subscription payments are generally non-refundable once the applicable paid billing period has begun.',
      ),
      p('We generally do not provide refunds solely because:'),
      ul([
        'You did not use the service',
        'You used only some paid features',
        'You forgot to cancel',
        'You did not use all plan limits',
        'You did not receive an interview',
        'You did not receive a job offer',
        'You disliked an AI-generated result',
        "An ATS score did not match an employer's system",
        'You changed your mind after using paid features',
      ]),
      p('Nothing in this policy limits rights that cannot lawfully be waived.'),
    ]),
    section('7', '7. Duplicate Charges', [
      p(
        'If you believe you were charged more than once for the same subscription period, contact us.',
      ),
      p('Please provide:'),
      ul(['Account email', 'Transaction date', 'Amount', 'Description of the issue']),
      p('Never email your complete payment-card number.'),
    ]),
    section('8', '8. Incorrect Charges', [
      p('Contact us if you believe:'),
      ul([
        'You were charged the wrong amount',
        'You were charged after properly canceling',
        'A technical error resulted in an incorrect charge',
        'You experienced duplicate billing',
      ]),
      p('We will review available billing records.'),
    ]),
    section('9', '9. Unauthorized Transactions', [
      p('If you believe a transaction was unauthorized:'),
      ol([
        'Contact your payment provider.',
        'Secure your FlacronCV account.',
        'Contact FlacronCV at contact@flacroncv.com.',
      ]),
    ]),
    section('10', '10. Exceptional Circumstances', [
      p('Flacron Enterprises may review refund requests involving:'),
      ul([
        'Confirmed duplicate billing',
        'Confirmed billing-system errors',
        'Unauthorized transactions',
        'Significant service failures preventing access to paid functionality',
        'Situations where refunds are required by applicable law',
      ]),
      p('Approval is not guaranteed unless required by law.'),
    ]),
    section('11', '11. Failed Payments', [
      p('If payment fails:'),
      ul([
        'Paid access may be restricted',
        'Subscription status may become past due',
        'Additional payment attempts may occur through the payment provider',
        'The account may eventually return to the Free Plan',
      ]),
    ]),
    section('12', '12. Refund Processing', [
      p('Approved refunds are generally returned to the original payment method.'),
      p('Processing time may depend on the payment provider, bank, or card issuer.'),
    ]),
    section('13', '13. Chargebacks', [
      p(
        'Before initiating a payment dispute, users are encouraged to contact support so we can review the billing issue.',
      ),
      p(
        'Fraudulent or abusive chargebacks may result in account restrictions where legally permitted.',
      ),
    ]),
    section('14', '14. Pricing Changes', [
      p('Subscription prices may change in the future.'),
      p(
        'Where required, appropriate notice should be provided before a pricing change affects an existing renewal.',
      ),
    ]),
    section('15', '15. Billing Contact', [
      p('FlacronCV Billing Support'),
      p('Email: contact@flacroncv.com'),
      p('Phone: 929-990-1182'),
      p('Operated by:'),
      p('Flacron Enterprises'),
      p('410 E 95th St'),
      p('Brooklyn, NY 11212'),
      p('United States'),
      p('Parent Company Email: Contact@flacronenterprises.com'),
      p('Powered by Flacron Engine'),
    ]),
  ],
};
