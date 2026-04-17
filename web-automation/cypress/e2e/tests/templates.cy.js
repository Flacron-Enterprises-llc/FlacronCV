


import SkillsPage from '../../pages/skillsPage';
import templatesPage from '../../pages/templatesPage';
import createNewCVPage from '../../pages/createNewCVPage';
//import { buildPdfFileName } from '../../support/pdfHelper'; //for geting project name
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'
import myCV from '../../pages/myCV';
import coverLetterPage  from '../../pages/coverLetterPage';
import coverLetterEditPage from '../../pages/coverLetterEditPage';
import myCoverLetterPage from '../../pages/myCoverLetterPage';


// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'
import skillsPage from '../../pages/skillsPage';
const loginObj = new authPage()
const headerObj = new headerPage()
const templateObj = new createNewCVPage()
const logoutObj = new logout()
  const cvPage = new templatesPage();
  const mycvObj = new myCV()
  const clObj = new coverLetterPage()
const editObj = new coverLetterEditPage()
const myClObj = new myCoverLetterPage()



// ─────────────────────────────────────────────────────────────────────────────
describe('FlacronCV - Validating Selecting CV template,creating new CV and validate it', () => {

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
               cvPage.visitPage();
         });

         
          slowCypressDown(500) 
    

    it('TC-01: Select random CV template and click Use Template, fill data,and validate cerated CV on MY CV page',{ retries: 2}, () => {

//navigate on template cv templated page
cy.log("======= Select randum cv templated ======")
  cvPage.clickCVTemplateTab()
  cvPage.clickRandomTemplate();
  cvPage.validateRedirect();

  
      const title = faker.person.jobTitle();
      templateObj.enterCVTitle(title);
      cy.wrap(title).as('title');
  
      templateObj.selectRandomFreeTemplate();
      cy.wait(500);
      
      templateObj.clickCreateCV();
      cy.wait(500);
      
      templateObj.validateConfirmationMsg();
      cy.wait(300);

      // adding information on create cv page and validate data on my cv page
      
          cy.log("======= Entring Data in Personal Information ======")
        
          skillsPage.uploadValidImageJpg()
          skillsPage.fillFirstName(faker.person.firstName())
          cy.get('@typedFirstName').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            });
        
          skillsPage.fillLastName(faker.person.lastName())
          cy.get('@typedLastName').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            });
        
        
          skillsPage.fillPhone(faker.phone.number())
          cy.get('@typedPH').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            });
        
          skillsPage.fillCity(faker.location.city())
          cy.get('@typedCity').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            });
        
          skillsPage.fillCountry(faker.location.country())
            cy.get('@typedCountry').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
        
          skillsPage.checkHeadline(faker.person.jobTitle())
          cy.get('@typedHL').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
        // Now call the alias
        skillsPage.storeProfessionalSummary()
            cy.get('@capturedSummary').then((savedText) => {
                cy.get(skillsPage.weblocators.previewWin).should('contain.text', savedText);
            });
        
          skillsPage.fillLinkedin('https://www.linkedin.com/in/asad-ibrahim-mastoi/')
          cy.get('@typedLinkedIn').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
          skillsPage.fillWebsite(faker.internet.url())
          cy.get('@typedWebsite').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
          cy.wait(200)
          //add Experiance
        
          
          cy.log("======= Adding Experiance ======")
            skillsPage.clickAndAddExp()
        
            skillsPage.addExpPosition(faker.person.jobTitle())
        
             cy.get('@position').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
            skillsPage.enterExpCompany(faker.company.buzzVerb())
              cy.get('@company').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
        
            skillsPage.selectSDate('2006-06')
            
             cy.get('@sdate').then((expectedValue) => {
       
              const input = expectedValue;
      
      const date = new Date(input + "-01"); // add day to make valid date
      
      const formatted = date.toLocaleString('en-US', {
        month: 'short',
        year: 'numeric'
      });
      
      cy.log(formatted); // Jun 2006
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', formatted);
            })
        
            skillsPage.selectEDate('2008-08')
      
            cy.get('@edate').then((expectedValue2) => {
        
              const input = expectedValue2
      
              const date = new Date(input + "-01"); // add day to make valid date
      
              const formatted = date.toLocaleString('en-US', {
               month: 'short',
               year: 'numeric'
              });
      
              cy.log(formatted); // Jun 2006
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', formatted);
         
            })
        
            
            skillsPage.enterJobDescription(faker.lorem.paragraph())
            cy.get('@jobdescription').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
            cy.wait(200)
        
            cy.log("======= Adding Education ======")
        
            skillsPage.clickAddEduButton()
            skillsPage.enterDeg('BS')
        
            skillsPage.enterFieldOFStudy('Science')
            
        
            skillsPage.enterInstitution('NICE')
        
            //validate degree
             cy.get('@deg').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
        
            ///validate degree
             cy.get('@FOS').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
        
             cy.get('@institution').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
            skillsPage.enterStartEnd('2001-2005')
             cy.get('@startEnd').then((expectedValue) => {
      
              
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
                  
            })
        
             cy.log("======= Adding Skill ======")
             skillsPage.addSkill()
          
             skillsPage.enterSkillName('AI')
              cy.get('@skillName').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
         
             cy.log("======= clicking Adding 1st Section button ======")
        
            skillsPage.clickAddSecBut()
        
          cy.log("======= Selecting project section ======")
        
          skillsPage.selectProjectSection()
          
                
          cy.log("======= clicking add item button in project ======")
           skillsPage.clickAddItemProjectButt()
        
        
             skillsPage.enterProjectTitle('AI')
        
             
              cy.get('@proTitle').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
             skillsPage.enterDescription('This is AI related priject')
              cy.get('@proDesc').then((expectedValue) => {
                cy.get(skillsPage.weblocators.previewWin)
                  .should('be.visible')
                  .and('contain.text', expectedValue);
            })
        
        
        
           cy.wait(200)
        
             cy.log("======= Adding certificate section ======")
             
             skillsPage.addingCertificate()
        
               skillsPage.addLanguageSection()
        
                cy.log("======= Adding Ref section ======")
                
                skillsPage.addRefSection()
        
        cy.log("======= Adding Custom section ======")
         
         skillsPage.addCustomSection()
        
         //vaidate create cv on MY CV page
       
         mycvObj.NavigateMyCvPage()
         mycvObj.validatePageTitle() //validate cv is created and displayed on cv page
      
      
      cy.get('@title').then((projectName) => {
          
         mycvObj.validateCreatedCV(projectName) 
      
      })
      
          mycvObj.clickDashboard()
      
    logoutObj.logoutMain()

});

// validfate Cover letter template

it('TC-02: Select random CV template and click Use Template, fill data,and validate cerated CV on MY CV page',{ retries: 2}, () => {

//navigate on template cv templated page
cy.log("======= Select randum cover letter templated ======")

  cvPage.clickCoverLetterTemplate()
  cvPage.clickRandomTemplate();
  cvPage.validateRedirectCoverletterTem();

  //enter data in new cover letter form
cy.log("======= enter data in new cover letter form ======")

           
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
      
              // enter name and email and check on preview window
      
              editObj.enterName(faker.person.firstName())
      
              editObj.validatePreviewName('@name')
              editObj.enterEmail(faker.internet.email())
              editObj.validatePreviewEmail('@email')
      
              
       //vaidate create cover letter on MY Cover Letter page
     
       myClObj.NavigateMyCoverLetterPage()
       myClObj.validatePageTitle() //validate cover Letter is created and displayed on cover letter page
    
    
    cy.get('@title').then((coverletterTitle) => {
        
       myClObj.validateCreatedCL(coverletterTitle) 
    
       cy.get('@CName').then((CName) => {
      myClObj.validateCompanyName(CName);
      });
    
      cy.get('@jobTitle').then((jobTitle) => {
      myClObj.validateJobTitle(jobTitle);
    });
    
    myClObj.validateAIicon()
        
    })
    
        myClObj.clickDashboard()
    
         logoutObj.logoutMain()
      

    })



    
  it('TC: 03: create cover letter with blank button without using any AI',{ retries: 2}, () => {
                         
    
//navigate on template cv templated page
cy.log("======= Select randum cover letter templated ======")

  cvPage.clickCoverLetterTemplate()
  cvPage.clickRandomTemplate();
  cvPage.validateRedirectCoverletterTem();

  //enter data in new cover letter form
cy.log("======= enter data in new cover letter form ======")
  
     clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         clObj.enterJobTitle(faker.person.jobTitle())
         clObj.clickCreateBlank()
     
         cy.wait(200)
         clObj.confirmationMsgForGenerateCL()
            
         cy.wait(300)
     
             //validate text area text
          editObj.validateEmptyPreviewMessage()
              
             //vaidate create cv on MY CV page
 
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cv is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });

  cy.get('@jobTitle').then((jobTitle) => {
  myClObj.validateJobTitle(jobTitle);
});

  
myClObj.validateAIiconNotPresent()
   

})

    myClObj.clickDashboard()

     logoutObj.logoutMain()
  

})        
    
})
