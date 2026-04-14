
import SkillsPage from '../../pages/skillsPage';
import createNewCVPage from '../../pages/createNewCVPage';
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'

// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'
import skillsPage from '../../pages/skillsPage';
import myCV from '../../pages/myCV';

const loginObj = new authPage()
const headerObj = new headerPage()
const templateObj = new createNewCVPage()
const logoutObj = new logout()
const mycvObj = new myCV()

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
    
    templateObj.visit();
    cy.wait(500);
    
    const title = faker.person.jobTitle();
    templateObj.enterCVTitle(title);
    cy.wrap(title).as('title');

    templateObj.selectRandomFreeTemplate();
    cy.wait(500);
    
    templateObj.clickCreateCV();
    cy.wait(500);
    
    templateObj.validateConfirmationMsg();
    cy.wait(300);
});

  })
  
        slowCypressDown(800) 


  it('TC-1 : create cv ,validate PDF and validate created cv on MY CV page',{ retries: 2 },()=>{
  
  
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
  
  
  })
  
  
 it('TC-2 : varify data on MY CV Page',{ retries: 2 },()=>{
    
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
  
      
     //  skillsPage.selectSkillLevel()
     
  
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
   mycvObj.validatePageTitle()


cy.get('@title').then((projectName) => {
    
   mycvObj.validateCreatedCV(projectName) 

})

  //  mycvObj.clickDashboard()
    mycvObj.clickEditButton()
    mycvObj.validateDataonEditPage()    

     logoutObj.logoutMain()
  
  
  })

  it('TC-3 : varify data on MY CV Page and edit it',{ retries: 2 },()=>{
    
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
       mycvObj.validatePageTitle()
    
    
    cy.get('@title').then((projectName) => {
    
       mycvObj.validateCreatedCV(projectName) 
    
    })
    
    mycvObj.clickEditButton()
    mycvObj.validateDataonEditPage()    
    
    //edit all fields and save it
    
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
    //add Experiance in edit mode
      
      
    cy.log("======= Adding Experiance ======")
      skillsPage.clickAddExpOnEditPage()
      
      skillsPage.addExpPositionOnEditpage(faker.person.jobTitle())
      
       cy.get('@position').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
      
      skillsPage.enterCompanyInEditPage(faker.company.buzzVerb())
        cy.get('@company').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
      
      
      skillsPage.sdateOnedit('2006-08')
      
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
      
      skillsPage.edateOnEdit('2008-09')
    
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
      
      
      skillsPage.descriptionOnEditPage(faker.lorem.paragraph())
      cy.get('@jobdescription').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
      
      cy.wait(200)
      
      cy.log("======= Adding Education ======")
      
      skillsPage.clickAddEduforEditPage()
      skillsPage.enterDegOnEditPage('MS')
      
      skillsPage.FieldOfStudyOnEditPage('PEN TESTING advance')
      
      
      skillsPage.institutionOnEditPage('NICE uni')
      
      
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
      
     skillsPage.sedateOnEditPage('2003-2006')
       cy.get('@startEnd').then((expectedValue) => {
    
        
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
            
      })
      
       cy.log("======= Adding Skill ======")
       skillsPage.addSkill()
    
       skillsPage.skillOnEditPage('AI advance')
        cy.get('@skillName').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
       mycvObj.clickDashboard()
    
     logoutObj.logoutMain()
      
      
  })

  //check duplicate button

  it('TC-4 : varify Duplicate button',{ retries: 2 },()=>{
    
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
       mycvObj.validatePageTitle()
    
   

    // We use the alias '@title' which you stored during cv creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        mycvObj.clickDuplicateAndEdit(projectName);
    });

    mycvObj.validateDataonEditPage()         


    cy.wait(300)
      mycvObj.clickDashboard()
    
    logoutObj.logoutMain()
           
  })


  // check delete icon
  it('TC-5 : varify Delete button',{ retries: 2 },()=>{
    
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
       //vaidate create cv on MY CV page
     
       mycvObj.NavigateMyCvPage()
       mycvObj.validatePageTitle()
    
       // We use the alias '@title' which you stored during cv creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        mycvObj.clickDeleteIcon(projectName)
    });
   
    cy.wait(300)
      mycvObj.clickDashboard()
    
    logoutObj.logoutMain()
      
      
  })

 it.only('TC-6 : Cancel button on varify Delete button',{ retries: 2 },()=>{
    
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
       //vaidate create cv on MY CV page
     
       mycvObj.NavigateMyCvPage()
       mycvObj.validatePageTitle()
    
       // We use the alias '@title' which you stored during cv creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        mycvObj.validateCancelDeletion(projectName)
    });
   
    cy.wait(300)
      mycvObj.clickDashboard()
    
    logoutObj.logoutMain()
      
      
  })





})