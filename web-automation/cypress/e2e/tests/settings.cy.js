// cypress/e2e/skills.cy.js
// Test Suite: FlacronCV - Skills Section + Preview + Toolbar
// Pattern: POM | Simple & Easy to Understand

import SkillsPage from '../../pages/skillsPage';
import createNewCVPage from '../../pages/createNewCVPage';
//import { buildPdfFileName } from '../../support/pdfHelper'; //for geting project name
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'
import settings from '../../pages/settings';

// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'
import skillsPage from '../../pages/skillsPage';
const loginObj = new authPage()
const headerObj = new headerPage()
const templateObj = new createNewCVPage()
const settingObj = new settings()
const logoutObj = new logout()

// ─────────────────────────────────────────────────────────────────────────────
describe('FlacronCV - Validating setting page', () => {

    
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
        
        settingObj.visitPage()

        cy.wait(500);
        
    });
            })
      
            slowCypressDown(800) 
      
    


it('TC-1: Upload and verify valid PNG profile image', { retries: 0 },()=>{


  settingObj.uploadValidImagePng()

   logoutObj.logoutMain()
  

})

it('TC-3: Upload and verify valid JPG image',{ retries: 2 }, ()=>{

  settingObj.uploadValidImageJpg()

   logoutObj.logoutMain()


})

it('TC-4: Upload and verify invalid image/file',{ retries: 1 }, ()=>{

  settingObj.uploadInvaidImageFile()

   logoutObj.logoutMain()

})


it.only('TC-5: Enter data in profile form and save it and validate',{ retries: 0 }, ()=>{

    const regEmail = signUpData.email 
           
    settingObj.validateEmail(regEmail)

  settingObj.enterFName(faker.person.firstName())
  
    
  settingObj.enterLName(faker.person.lastName())
   
  settingObj.enterHeadLine(faker.person.jobTitle())
   
  settingObj.enterBio('this is my bio')
    
  settingObj.enterLocation('pakistan')
  settingObj.enterLinkedIn('https://www.linkedin.com/in/test/')
  settingObj.enterGithub('https://github.com/Flacron-Enterprises-llc/FlacronBuild')
  settingObj.clickSaveButton()
  cy.wait(200)
  
  settingObj.confirmationMSG()

  //validate entred data
  cy.reload();


  

  settingObj.validateFirstName()
  settingObj.validateLastName()
  settingObj.validateHL()
  settingObj.validateBio()
  settingObj.validateLocation()
  settingObj.validateLinkedIn()
  settingObj.validateGithub()

   logoutObj.logoutMain()

})






})