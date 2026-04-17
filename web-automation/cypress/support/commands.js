// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
// cypress/support/commands.js

// cypress/support/commands.js


Cypress.Commands.add('verifyPageIsNotBlank', () => {
  cy.location('pathname').then(pathname => {
    cy.get('body').then($body => {
      const hasContent =
        $body.find('h1, h2, h3, section, main, article').length > 0

      if (!hasContent) {
        // 📸 Capture screenshot BEFORE failing
        cy.screenshot(`blank-page-${pathname.replace(/\//g, '-')}-${Date.now()}`)

        throw new Error(`
❌ UI NOT RENDERED – APPLICATION BUG

Navigation to "${pathname}" succeeded,
but the page rendered a blank screen.

This is a functional defect.

Action required:
• Frontend team must fix component rendering
` )

      }
    })
  })
})

// in order to varify email auto

const { MailSlurp } = require('mailslurp-client');
const mailslurp = new MailSlurp({ apiKey: Cypress.env('MAILSLURP_API_KEY') });

Cypress.Commands.add("createInbox", () => {
  return mailslurp.createInbox();
});

Cypress.Commands.add("waitForLatestEmail", (inboxId) => {
  return mailslurp.waitForLatestEmail(inboxId, 30000); // 30s timeout
});




