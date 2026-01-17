// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'
import 'cypress-mochawesome-reporter/register';
import './randumSelectDropdownMenu'
//import './comboDropdown'
//import './smartNext'
//require('cypress-xpath');
import 'cypress-plugin-steps'
import 'cypress-slow-down'
//import './downloadAndVerifyPSD'
//import './ValidatePDFLanguage'

Cypress.on('window:before:load', win => {
  cy.stub(win.console, 'error').as('consoleError')
})

/*
afterEach(() => {
  cy.get('@consoleError').should('not.be.called')
})
  */

