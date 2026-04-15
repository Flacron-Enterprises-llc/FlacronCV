
import coverLetterPage  from '../../pages/coverLetterPage';
import coverLetterEditPage from '../../pages/coverLetterEditPage';
import myCoverLetterPage from '../../pages/myCoverLetterPage';
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'

// import all data json file from fixtures folder


import signUpData from '../../fixtures/signUpData.json'


const loginObj = new authPage()
const clObj = new coverLetterPage()
const editObj = new coverLetterEditPage()
const myClObj = new myCoverLetterPage()
const logoutObj = new logout()


describe('FlacronCV - Validating Selecting Cover Letter cart , and validate title, data and all buttons', () => {


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

    
  it('TC: 01: Create Cover letter with AI Generate button and validate data on My CoverLetter Page',{ retries: 1}, () => {
               
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
  
  
 it('TC-2 : varify data on MY cover letter page with create blank button and AI Improve button ',{ retries: 1 },()=>{
                         
         clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         clObj.enterJobTitle(faker.person.jobTitle())
         clObj.clickCreateBlank()
     
         cy.wait(200)
         clObj.confirmationMsgForGenerateCL()
            
         cy.wait(300)
     
     
         editObj.enterName(faker.person.firstName())
     
         editObj.validatePreviewName('@name')
         editObj.enterEmail(faker.internet.email())
         editObj.validatePreviewEmail('@email')
     
             //validate text area text
          editObj.validateEmptyPreviewMessage()
     
             //validate AI Improve button
     
         editObj.clickAIimproveButton()
             cy.wait(300)
             editObj.AIimproveMsg()
             cy.wait(300)
     
             editObj.validateTextAreaWithPreview()
     
          
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

//myClObj.validateAIiconNotPresent()
   

})

    myClObj.clickDashboard()

     logoutObj.logoutMain()
  
  })


 it('TC-3 : varify data on MY cover letter Page with create blank button and without AI IMprove button clicking',{ retries: 1 },()=>{
    
     clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         clObj.enterJobTitle(faker.person.jobTitle())
         clObj.clickCreateBlank()
     
         cy.wait(200)
         clObj.confirmationMsgForGenerateCL()
            
         cy.wait(300)
     
     
         editObj.enterName(faker.person.firstName())
     
         editObj.validatePreviewName('@name')
         editObj.enterEmail(faker.internet.email())
         editObj.validatePreviewEmail('@email')
     
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

//myClObj.validateAIiconNotPresent()
   

})

    myClObj.clickDashboard()

     logoutObj.logoutMain()
  
  })

 it('TC-4 : Validate data on Cover letter Edit page created with Generate with AI button',{ retries: 2},()=>{
   
            
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

           editObj.validateTextAreaWithPreview()
  
          
   //vaidate create cover letter on MY Cover letter page
 
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cover letter is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });

  cy.get('@jobTitle').then((jobTitle) => {
  myClObj.validateJobTitle(jobTitle);
});

//myClObj.validateAIicon()
   

})

 

    myClObj.clickEditButton()
    myClObj.validateDataonEditPage()    

     logoutObj.logoutMain()
  
  
  })

  
 it('TC-5: Validate data on Cover letter Edit page created with create blank button with AI IMprove button',{ retries: 2 },()=>{
        
  clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         clObj.enterJobTitle(faker.person.jobTitle())
         clObj.clickCreateBlank()
     
         cy.wait(200)
         clObj.confirmationMsgForGenerateCL()
            
         cy.wait(300)
     
     
         editObj.enterName(faker.person.firstName())
     
         editObj.validatePreviewName('@name')
         editObj.enterEmail(faker.internet.email())
         editObj.validatePreviewEmail('@email')
     
             //validate text area text
          editObj.validateEmptyPreviewMessage()
     
             //validate AI Improve button
             
         editObj.clickAIimproveButton()
             cy.wait(300)
             editObj.AIimproveMsg()
             cy.wait(300)
          
             editObj.validateTextAreaWithPreview()
     
          
          
   //vaidate create cover letter on MY cover letter page
 
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cover letter is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });

  cy.get('@jobTitle').then((jobTitle) => {
  myClObj.validateJobTitle(jobTitle);
});

//myClObj.validateAIicon()
   

})

 
    myClObj.clickEditButton()
    myClObj.validateDataonEditPage2()    

     logoutObj.logoutMain()
  
  
  })
  
 it('TC-6 : Validate data on Cover letter Edit page created with create blank button without AI improve button',{ retries: 2 },()=>{
    
   
         clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         
         clObj.clickCreateBlank()
        
         cy.wait(500)
         clObj.confirmationMsgForGenerateCL()
         cy.wait(400)

             
         editObj.enterName(faker.person.firstName())
     
         editObj.validatePreviewName('@name')
         editObj.enterEmail(faker.internet.email())
         editObj.validatePreviewEmail('@email')
 
         //validate provided data on edit page preview window
 
         editObj.validateCurrentDate()
         editObj.validateEditorIsEmpty()
         editObj.validateEmptyPreviewMessage()
         cy.wait(400)


   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cover letter is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });




//myClObj.validateAIicon()
   

})

  //  mycvObj.clickDashboard()
    myClObj.clickEditButton()
    myClObj.validateDataonEditPage3()    
    editObj.validateEmptyPreviewMessage()

     logoutObj.logoutMain()
  
  
  })


  //check duplicate button

  it('TC-7 : varify Duplicate button for creating cover letter with AI gererate button',{ retries: 2 },()=>{
    
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
  
          
   //vaidate create cover letter on MY cover letter page
 
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cover letter is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });

  cy.get('@jobTitle').then((jobTitle) => {
  myClObj.validateJobTitle(jobTitle);
});

   

})

  

    // We use the alias '@title' which you stored during cover letter creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        myClObj.clickDuplicateAndEdit(projectName);
    });

     myClObj.validateDataonEditPageDuplicate()    
   

  
    logoutObj.logoutMain()
           
  })


  it('TC-8 : varify Duplicate button for creatign cover letter with Create Blank cover letter and than click AI improve button',{ retries: 2 },()=>{
    
   clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         clObj.enterJobTitle(faker.person.jobTitle())
         clObj.clickCreateBlank()
     
         cy.wait(200)
         clObj.confirmationMsgForGenerateCL()
            
         cy.wait(300)
     
     
         editObj.enterName(faker.person.firstName())
     
         editObj.validatePreviewName('@name')
         editObj.enterEmail(faker.internet.email())
         editObj.validatePreviewEmail('@email')
     
             //validate text area text
          editObj.validateEmptyPreviewMessage()
     
             //validate AI Improve button
     
         editObj.clickAIimproveButton()
             cy.wait(300)
             editObj.AIimproveMsg()
             cy.wait(300)
     
             editObj.validateTextAreaWithPreview()
     
    //vaidate create cover letter on MY cover letter page
 
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cover letter is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });

  cy.get('@jobTitle').then((jobTitle) => {
  myClObj.validateJobTitle(jobTitle);
});

})

  

    // We use the alias '@title' which you stored during cover letter creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        myClObj.clickDuplicateAndEdit(projectName);
    });

   myClObj.validateDataonEditPageDuplicate2()  
   

  
    logoutObj.logoutMain()
           
  })


  
  it('TC-9 : varify Duplicate button for creatign cover letter with Create Blank cover letter ',{ retries: 2 },()=>{
    
   clObj.enterTitle(faker.person.jobTitle())
         clObj.enterCompanyName(faker.company.buzzNoun())
         clObj.enterJobTitle(faker.person.jobTitle())
         clObj.clickCreateBlank()
     
         cy.wait(200)
         clObj.confirmationMsgForGenerateCL()
            
         cy.wait(300)
     
     
         editObj.enterName(faker.person.firstName())
     
         editObj.validatePreviewName('@name')
         editObj.enterEmail(faker.internet.email())
         editObj.validatePreviewEmail('@email')
     
             //validate text area text
          editObj.validateEmptyPreviewMessage()
     
             //validate AI Improve button
     
    //vaidate create cover letter on MY cover letter page
 
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle() //validate cover letter is created and displayed on cover letter page


cy.get('@title').then((coverletterTitle) => {
    
   myClObj.validateCreatedCL(coverletterTitle) 

   cy.get('@CName').then((CName) => {
  myClObj.validateCompanyName(CName);
  });

  cy.get('@jobTitle').then((jobTitle) => {
  myClObj.validateJobTitle(jobTitle);
});

})

  

    // We use the alias '@title' which you stored during cover letter creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        myClObj.clickDuplicateAndEdit(projectName);
    });

     myClObj.validateDataonEditPageDuplicate3()    
   
     editObj.validateEmptyPreviewMessage()
  
    logoutObj.logoutMain()
           
  })


  // check delete icon
  it('TC-10 : varify Delete button for Created coverLetter',{ retries: 2 },()=>{
    
         
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
  
          
  
     
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle()

       // We use the alias '@title' which you stored during cover letter creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        myClObj.clickDeleteIcon(projectName)
    });
   
    cy.wait(300)
      myClObj.clickDashboard()
    
    logoutObj.logoutMain()
      
      
  })

 it('TC-11 : Cancel button on varify Delete button',{ retries: 2 },()=>{
   
         
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
  
   myClObj.NavigateMyCoverLetterPage()
   myClObj.validatePageTitle()

   cy.wait(200)
    
       // We use the alias '@title' which you stored during coverLetter creation
    cy.get('@title').then((projectName) => {
        // This single call handles clicking duplicate, confirming msg, 
        // and clicking Edit on the (Copy) card.
        myClObj.validateCancelDeletion(projectName)
    });
   
    cy.wait(300)
      myClObj.clickDashboard()
    
    logoutObj.logoutMain()
      
      
  })





})
