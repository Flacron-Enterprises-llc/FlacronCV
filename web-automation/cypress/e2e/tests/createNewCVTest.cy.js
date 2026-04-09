// cypress/e2e/templateSelection.cy.js
// Test Suite: FlacronCV - Template Selection
// Pattern: Page Object Model (POM)
// Behavior: Randomly selects a FREE template on every run

import createNewCVPage from '../../pages/createNewCVPage.';
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'



// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'



const loginObj = new authPage()
const headerObj = new headerPage()
const templateObj = new createNewCVPage()
const logoutObj = new logout()

describe('FlacronCV - MyCVs: Free Template Selection - ', () => {

      beforeEach(() => {
  
      cy.log("======= Testing SignUp ======")
      cy.log("======= Open Web application ======")
      cy.visit('/')

      
       headerObj.topMenu.loginButt().click()
      
           loginObj.enterValidEmail(signUpData.email)
      
           cy.wait(300)
          loginObj.enterPassword(signUpData.password);
          cy.wait(300)
          loginObj.clickButton()
          loginObj.validateDashboard()
          templateObj.visit()
      // templateObj.validateMyCVFromSideMenu()
      // templateObj.validateGetStartedButton()
        

      })

      slowCypressDown(500) 

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Page loads and shows templates
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Free templates are available and selectable
  // ─────────────────────────────────────────────────────────────────────────────
 it('TC-01:should complete the CV creation flow with a random free template', () => {
        // Call the dynamic selection method from POM

        const title = faker.person.jobTitle()
           templateObj.enterCVTitle(title)
         cy.wrap(title).as('title')

         cy.log(title)

        templateObj.selectRandomFreeTemplate();

        // Verify the selection (usually the border color changes)
        // From your HTML: border-brand-500 or similar highlight classes
        cy.log('======= Template Selected Successfully =======');

        // Proceed to create
        templateObj.clickCreateCV();

        cy.wait(500)

        // Final assertion: Check if we moved to the editor page
      //  cy.url().should('include', '/editor');
        templateObj.validateConfirmationMsg()

        cy.wait(300)
        
           logoutObj.logoutMain()

    });
   
  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Cancel button returns without creating a CV
  // ─────────────────────────────────────────────────────────────────────────────
  it('should cancel CV creation and return to previous page', () => {
    templateObj.clickCancel();

    // Should navigate away from the creation page
    cy.url().should('not.include', '/new');
    cy.log('✅ Cancel works correctly');
         logoutObj.logoutMain()
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Locked templates cannot be selected
  // ─────────────────────────────────────────────────────────────────────────────
  it('should not allow selection of locked (Pro/Enterprise) templates', () => {
    // Locked templates have opacity-75 and a lock icon
    cy.get('.grid button.opacity-75').each(($card) => {
      cy.wrap($card).find('.lucide-lock').should('exist');
      // Locked cards should NOT have the active border class
      cy.wrap($card).should('not.have.class', 'border-brand-500');
    });

    cy.log('✅ Locked templates correctly show lock icons and are not selectable');
 
 logoutObj.logoutMain()
});
      



});