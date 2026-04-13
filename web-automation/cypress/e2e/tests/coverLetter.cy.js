import coverLetterPage  from '../../pages/coverLetterPage';
//import { buildPdfFileName } from '../../support/pdfHelper'; //for geting project name
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'
import coverLetterEditPage from '../../pages/coverLetterEditPage';
import myCV from '../../pages/myCV';


// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'
const loginObj = new authPage()
const headerObj = new headerPage()
const logoutObj = new logout()
const clObj = new coverLetterPage()
const editObj = new coverLetterEditPage()
const mycvObj = new myCV()


describe('FlacronCV - Create Cover Letter Automation', () => {

    beforeEach(() => {
        cy.task("clearDownloadsFolder");
            
              cy.clearCookies();
              cy.clearLocalStorage();
              cy.window().then((win) => {
                win.sessionStorage.clear();
               
              });
                  
        
               cy.log("======= Testing SignUp ======")
                cy.log("======= Open Web application ======")
                cy.visit('/')
                cy.visit('/login')
         
              cy.wait(300)
        
             cy.url().then((currentUrl) => {
        
              cy.log('url is' + currentUrl)
            
            // SCENARIO 1: On Dashboard - Logout and Re-login
            if (currentUrl.includes('/dashboard')) {
                cy.log('👉 Scenario: Already on Dashboard - Resetting via Logout');
               cy.wait(300)
                logoutObj.logoutMain();
                 cy.wait(300)
                cy.reload(); 
                 cy.wait(300)
                
                cy.visit('/login');
                loginObj.enterValidEmail(signUpData.email);
                cy.wait(300);
                loginObj.enterPassword(signUpData.password);
                cy.wait(300);
                loginObj.clickButton();
            } 
        
            // SCENARIO 2: On Login Page - Direct Login
            else if(currentUrl.includes('/login')) {
                cy.log('👉 Scenario: Already on Login Page');
                 cy.wait(300);
                loginObj.enterValidEmail(signUpData.email);
                cy.wait(300);
                loginObj.enterPassword(signUpData.password);
                cy.wait(300);
                loginObj.clickButton();
            } 
        
            // SCENARIO 3: Landing Page or any other URL
            else{
                cy.log('👉 Scenario: On Landing Page - Navigating to Login');
                cy.visit('/login');
                
                loginObj.enterValidEmail(signUpData.email);
                cy.wait(300);
                loginObj.enterPassword(signUpData.password);
                cy.wait(300);
                loginObj.clickButton();
            }
        
            // --- REMAINING TASK EXECUTION ---
            loginObj.validateDashboard();
            
            clObj.visitNewCoverLetterPage()
            cy.wait(500);
        });
          clObj.visitNewCoverLetterPage()
    });

      slowCypressDown(800) 

    it('TC: 01: Validate AI Generate button , Create blank button and cancel button on empty state for vaidate mandatory fields',{ retries: 1 }, () => {
        
      
        clObj.clickGenerateWithAI()

        clObj.alertMsg()

        clObj.clickCreateBlank()
         clObj.alertMsg()

         clObj.clickCancelbutton()
         cy.url().should('include', '/dashboard');
          logoutObj.logoutMain()
    });


    it('TC: 02: Enter Only Title and Validate Create blank button , Create blank button and cancel button on empty state for vaidate mandatory fields',{ retries: 1 }, () => {
        
        
        
        clObj.enterTitle(faker.person.jobTitle())
        clObj.clickCreateBlank()
        clObj.createBlankMsg()
          logoutObj.logoutMain()
    });

     it('TC: 03: Enter Only Title and Validate AI genarted button , Create blank button and cancel button on empty state for vaidate mandatory fields',{ retries: 1 }, () => {
             
        clObj.enterTitle(faker.person.jobTitle())
        clObj.clickGenerateWithAI()
        clObj.erroAIgeneratedButt()
        cy.wait(300)
          logoutObj.logoutMain()
    });

 it('TC: 04: Enter Title and company name and job title and Validate AI genarted button',{ retries: 2 }, () => {
             
        clObj.enterTitle(faker.person.jobTitle())
        clObj.enterCompanyName(faker.company.buzzNoun())
        clObj.enterJobTitle(faker.person.jobTitle())
        clObj.clickGenerateWithAI()
        clObj.erroAIgeneratedButt()
        cy.wait(300)
        logoutObj.logoutMain()
});

    

it('TC: 05: Enter Values in all fields with AI generated job descrption and click AI Generate button for Job Description',{ retries: 1 }, () => {
             
        clObj.enterTitle(faker.person.jobTitle())
         
       clObj.enterRecipintName(faker.person.jobTitle())
        
        clObj.enterCompanyName(faker.company.buzzNoun())
       
        clObj.enterJobTitle(faker.person.jobTitle())
        
        clObj.clickAIGenerateBut()
        cy.wait(1000)
        clObj.getJobDescription()
        cy.wait(1000)
        clObj.confirmationMsgForAIGenerateJobDescription()
        cy.wait(500)
        clObj.selectCV()
        cy.wait(500)
        clObj.clickGenerateWithAI()
        cy.wait(500)
        clObj.confirmationMsgForGenerateCL()
        cy.wait(400)

        //validate provided data on edit page preview window

        editObj.validateCurrentDate()


        editObj.validateRecipientName('@RName')
        editObj.validateCompanyName('@CName')
        editObj.validatePosition('@jobTitle')

        logoutObj.logoutMain()
    });

    it('TC: 06: Enter Values in all fields and leave AI generated Job description click AI Generate button for Job Description',{ retries: 1 }, () => {
             
        clObj.enterTitle(faker.person.jobTitle())
         
       clObj.enterRecipintName(faker.person.jobTitle())
        
        clObj.enterCompanyName(faker.company.buzzNoun())
       
        clObj.enterJobTitle(faker.person.jobTitle())

        cy.wait(500)
        clObj.selectCV()
        cy.wait(500)
        clObj.clickGenerateWithAI()
        cy.wait(500)
        clObj.confirmationMsgForGenerateCL()
        cy.wait(400)

        //validate provided data on edit page preview window

        editObj.validateCurrentDate()

        editObj.validateRecipientName('@RName')
        editObj.validateCompanyName('@CName')
        editObj.validatePosition('@jobTitle')

        logoutObj.logoutMain()
    });

    it('TC: 07: Validate Create Blank button with only providing title',{ retries: 1 }, () => {
             
        clObj.enterTitle(faker.person.jobTitle())
        clObj.clickCreateBlank()
       
        cy.wait(500)
        clObj.confirmationMsgForGenerateCL()
        cy.wait(400)

        //validate provided data on edit page preview window

        editObj.validateCurrentDate()
        editObj.validateEditorIsEmpty()
        editObj.validateEmptyPreviewMessage()
        cy.wait(400)

        logoutObj.logoutMain()
    });

    it('TC:08:  Verify CV dropdown matches the 10 latest CVs from My CVs page',{ retries: 1 }, () => {
        // 1. Go to My CVs page and grab the titles
         mycvObj.NavigateMyCvPage()

    cy.wait(300)

        mycvObj.getCVTitlesArray().then((cvTitles) => {
            
            // Log for debugging (optional)
            cy.log('Titles found on CV page: ' + cvTitles.join(', '));

            // 2. Go to Create Cover Letter page
            cy.wait(300)
  
             clObj.visitNewCoverLetterPage()

            // 3. Validate the dropdown options
            // We use .each to check if every title from our list exists in the dropdown
            cvTitles.forEach((title) => {
                 clObj.cvLinkSelect()
                    .contains('option', title)
                    .should('exist');
            });

            // 4. Optional: Verify the count is exactly 10 + "No CV selected"
            clObj.cvLinkSelect()
                .find('option')
                .should('have.length', 11); 
        });
         logoutObj.logoutMain()
    });


   
});
