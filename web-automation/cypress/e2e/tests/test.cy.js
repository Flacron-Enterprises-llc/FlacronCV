

import signUp from '../../pages/signUpPage'
import landingPage from '../../pages/landingPage'
import { slowCypressDown } from 'cypress-slow-down'
import logout from '../../pages/logout'

import 'cypress-plugin-steps'

import {faker} from '@faker-js/faker'  //faker for fack data for testing

// object for each impored class 

const signupObj = new signUp()
const landingObj = new landingPage()
const logoutObj = new logout()

//const loginObj = new loginPage()

describe('test', ()=>{

  
      beforeEach(() => {
  
      cy.log("======= Testing SignUp ======")
      cy.log("======= Open Web application ======")
      cy.visit('/')
      })
      slowCypressDown(300) 
  
it('TC-01: Create Account with valid data and validate verification email', () => {
    // 1. Create a dynamic inbox using MailSlurp
    cy.createInbox().then((inbox) => {
        const inboxId = inbox.id;
        const emailAddress = inbox.emailAddress; // This is: 1cd0bca6... @mailslurp.world
        
        cy.log("======= Clicking Get Start Free button from landing page ======");
        landingObj.getStartFreeButt();
        
        cy.log("======= Validate Page title ======");
        signupObj.validatePageTitle();

        cy.log("======= Entering valid Data in all fields ======");
        const fullName = faker.person.firstName();
        signupObj.enterFullName(fullName);
        
        // 2. Use the MailSlurp email instead of Faker or a static one
        signupObj.enterEmail(emailAddress); 
        
        signupObj.enterPassword(faker.internet.password({ length: 8 }));
        signupObj.clickButton();

        cy.log("======= Verify send email page ======");
        signupObj.verifySendEmail();

        // 3. AUTO-VALIDATE THE EMAIL
        cy.log("======= Waiting for verification email... ======");
        cy.waitForLatestEmail(inboxId).then((email) => {
            expect(email.subject).to.contain("Verify your account"); // Change to your actual subject
            
            // Optional: Extract a code if your app sends one
            const verificationCode = /([0-9]{6})/.exec(email.body)[1];
            cy.log("Verification Code Found: " + verificationCode);
            
            // If your app has a "Verify" screen, you can type the code here:
            // signupObj.enterVerificationCode(verificationCode);
        });

        signupObj.verifyLogout();
    });
});

})