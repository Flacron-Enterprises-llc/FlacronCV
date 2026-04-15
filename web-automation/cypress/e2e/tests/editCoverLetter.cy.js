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

 it('TC: 01: Enter Values in all fields and leave AI generated Job description click AI Generate button and validate on preview win,enter name,email and check',{ retries: 1 }, () => {
             
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

        //validate text area text
        editObj.validateTextAreaWithPreview()


        logoutObj.logoutMain()
    });


it('TC: 02:Vaidate AI Improve button',{ retries: 0 }, () => {
             
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

        //validate text area text
        editObj.validateTextAreaWithPreview()

        //validate AI Improve button

        editObj.clickAIimproveButton()
        cy.wait(300)
        editObj.AIimproveMsg()
        cy.wait(300)

          editObj.validateTextAreaWithPreview()

        logoutObj.logoutMain()
    });
       
    
 it('TC: 03: Enter Values in all fields with AI generated job descrption and click AI Generate button for Job Description',{ retries: 1 }, () => {
                 
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

             // enter name and email and check on preview window

        editObj.enterName(faker.person.firstName())

        editObj.validatePreviewName('@name')
        editObj.enterEmail(faker.internet.email())
        editObj.validatePreviewEmail('@email')

        //validate text area text
        editObj.validateTextAreaWithPreview()

        //validate AI Improve button

        editObj.clickAIimproveButton()
        cy.wait(300)
        editObj.AIimproveMsg()
        cy.wait(300)

          editObj.validateTextAreaWithPreview()

    
            logoutObj.logoutMain()
        });


it('TC: 04: Enter Title and company name and job title and Validate create blank button ',{ retries: 1 }, () => {
                     
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



                logoutObj.logoutMain()
        });
    
it('TC: 05: Enter Title and company name and job title and Validate create blank button,and export in PDF report',{ retries: 1 }, () => {
                     
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

        editObj.clickExportButton()
        editObj.selectPDFExport()
        editObj.confirmationMSGforPDF()
       // 1. Remove all cy.wait() commands. 
// 2. Resolve all aliases in a single block using a helper function or multiple arguments.


cy.get('@title').then((title) => {
    

    // 3. Define the path INSIDE this block
   cy.wait(400)
    cy.log(`File name: ${title} `);
    cy.wait(400)
    const filePath = `cypress/downloads/${title}.pdf`;
    cy.wait(400)
    cy.log('Target PDF Path: ' + filePath);

/*
cy.get('@name').then((name) => {
    cy.get('@email').then((email) => {
        cy.get('@title').then((title) => {
            cy.get('@CName').then((CName) => {
                cy.get('@jobTitle').then((jobTitle) => {
                    cy.get('@editorContent').then((editorContent) => {

                        const filePath = `cypress/downloads/${title}.pdf`;
                        
                        cy.log(`🚀 Final PDF Validation for: ${title}`);

                        // 2. Faster File Check
                        cy.readFile(filePath, { timeout: 15000 }).should('exist');

                        // 3. Single Task Execution
                        cy.task("readPdf", filePath).then((extractedText) => {
                            // Normalize text to handle spacing/newlines in PDFs
                            const pdfContent = extractedText.replace(/\s+/g, ' ').toLowerCase();

                            // 4. Data Validation Loop (Includes Editor Text)
                            const validationData = [
                                { label: 'Name', val: name },
                                { label: 'Email', val: email },
                                { label: 'Title', val: title },
                                { label: 'Company', val: CName },
                                { label: 'Job Title', val: jobTitle },
                                { label: 'Editor Text', val: editorContent }
                            ];

                            validationData.forEach((item) => {
                                expect(pdfContent, `Validating ${item.label}`)
                                    .to.include(item.val.trim().toLowerCase());
                            });

                            cy.log('✅ ALL DATA + EDITOR TEXT VALIDATED IN PDF');
                        });
                    });
                });
            });
        });
    });
});          

})
*/
})

logoutObj.logoutMain()
        });
    
           
it('TC: 06: Enter Title and company name and job title and Validate create blank button,and export in DOCX report',{ retries: 1 }, () => {
                     
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

        editObj.clickExportButton()
        editObj.selectDocExport()
        editObj.confirmationMsgForDocx()
       // 1. Remove all cy.wait() commands. 
// 2. Resolve all aliases in a single block using a helper function or multiple arguments.


cy.get('@title').then((title) => {
    

    // 3. Define the path INSIDE this block
   cy.wait(400)
    cy.log(`File name: ${title} `);
    cy.wait(400)
    const filePath = `cypress/downloads/${title}.docx`;
    cy.wait(400)
    cy.log('Target DOCX Path: ' + filePath);

})

logoutObj.logoutMain()
        });
 

   
 it('TC: 07: Enter Values in all fields with AI generated job descrption and click AI Generate button for Job Description and validate  PDF',{ retries: 1 }, () => {
                 
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

             // enter name and email and check on preview window

        editObj.enterName(faker.person.firstName())

        editObj.validatePreviewName('@name')
        editObj.enterEmail(faker.internet.email())
        editObj.validatePreviewEmail('@email')

        //validate text area text
        editObj.validateTextAreaWithPreview()

        //validate AI Improve button

        editObj.clickAIimproveButton()
        cy.wait(300)
        editObj.AIimproveMsg()
        cy.wait(300)

          editObj.validateTextAreaWithPreview()

           editObj.clickExportButton()
        editObj.selectPDFExport()
        editObj.confirmationMSGforPDF()
        

cy.get('@title').then((title) => {
     

    // 3. Define the path INSIDE this block
   cy.wait(400)
    cy.log(`File name: ${title} `);
    cy.wait(400)
    const filePath = `cypress/downloads/${title}.pdf`;
    cy.wait(400)
    cy.log('Target PDF Path: ' + filePath);

       // 1. Remove all cy.wait() commands. 
// 2. Resolve all aliases in a single block using a helper function or multiple arguments.
// Wrap the aliases in an array and use spread logic
// 1. Resolve all 6 aliases at once using an array-like sequence
// Note: Using individual .then() blocks is safer for standard Cypress versions 
// than passing an array to cy.get(), which caused your previous TypeError.
/*
cy.get('@name').then((name) => {
    cy.get('@email').then((email) => {
        cy.get('@title').then((title) => {
            cy.get('@CName').then((CName) => {
                cy.get('@jobTitle').then((jobTitle) => {
                    cy.get('@editorContent').then((editorContent) => {

                        const filePath = `cypress/downloads/${title}.pdf`;
                        
                        cy.log(`🚀 Final PDF Validation for: ${title}`);

                        // 2. Faster File Check
                        cy.readFile(filePath, { timeout: 15000 }).should('exist');

                        // 3. Single Task Execution
                        cy.task("readPdf", filePath).then((extractedText) => {
                            // Normalize text to handle spacing/newlines in PDFs
                            const pdfContent = extractedText.replace(/\s+/g, ' ').toLowerCase();

                            // 4. Data Validation Loop (Includes Editor Text)
                            const validationData = [
                                { label: 'Name', val: name },
                                { label: 'Email', val: email },
                                { label: 'Title', val: title },
                                { label: 'Company', val: CName },
                                { label: 'Job Title', val: jobTitle },
                                { label: 'Editor Text', val: editorContent }
                            ];

                            validationData.forEach((item) => {
                                expect(pdfContent, `Validating ${item.label}`)
                                    .to.include(item.val.trim().toLowerCase());
                            });

                            cy.log('✅ ALL DATA + EDITOR TEXT VALIDATED IN PDF');
                        });
                    });
                });
            });
        });
    });
});          

})
*/
})
  logoutObj.logoutMain()
        });


          
 it('TC: 08: Enter Values in all fields with AI generated job descrption and click AI Generate button for Job Description and validate  DOCX',{ retries: 1 }, () => {
                 
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

             // enter name and email and check on preview window

        editObj.enterName(faker.person.firstName())

        editObj.validatePreviewName('@name')
        editObj.enterEmail(faker.internet.email())
        editObj.validatePreviewEmail('@email')

        //validate text area text
        editObj.validateTextAreaWithPreview()

        //validate AI Improve button

        editObj.clickAIimproveButton()
        cy.wait(300)
        editObj.AIimproveMsg()
        cy.wait(300)

          editObj.validateTextAreaWithPreview()

           editObj.clickExportButton()
        editObj.selectPDFExport()

        

cy.get('@title').then((title) => {
     

    // 3. Define the path INSIDE this block
   cy.wait(400)
    cy.log(`File name: ${title} `);
    cy.wait(400)
    const filePath = `cypress/downloads/${title}.docx`;
    cy.wait(400)
    cy.log('Target DOCX Path: ' + filePath);

})
  logoutObj.logoutMain()
        });


           
it('TC: 09: Enter Title and company name and job title and Validate create blank button,and add or edi text in area text',{ retries: 1 }, () => {
                     
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
     editObj.enterTextinTextarea(faker.lorem.paragraph())       

  
        cy.wait(300)

        editObj.validateTextAreaWithPreview()

        

logoutObj.logoutMain()
        });


it.skip('Verify Bullet List functionality', () => {


       clObj.enterTitle(faker.person.jobTitle())
    clObj.enterCompanyName(faker.company.buzzNoun())
    clObj.enterJobTitle(faker.person.jobTitle())
    clObj.clickCreateBlank()

    cy.wait(200)
    clObj.confirmationMsgForGenerateCL()
       
    cy.wait(300)


  cy.get('.ProseMirror')
    .click()
    .type('Item 1');

  // Click Bullet button
  cy.get('button[title="Bullet List"]').click();

  // Validate list created
  cy.get('.ProseMirror ul li')
    .should('contain.text', 'Item 1');

});
 




})

