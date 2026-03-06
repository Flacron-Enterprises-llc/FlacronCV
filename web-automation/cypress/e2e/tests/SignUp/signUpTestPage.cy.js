

import signUpPage from '../../../pages/signUpPage'
import landingPage from '../../../pages/landingPage'
import { slowCypressDown } from 'cypress-slow-down'
import logout from '../../../pages/logout'
import signUpPaid from '../../../pages/signUpPaid'
import 'cypress-plugin-steps'

import {faker} from '@faker-js/faker'  //faker for fack data for testing

// object for each impored class 

const signupObj = new signUpPage()
const landingObj = new landingPage()
const logoutObj = new logout()
const signUpPaidObj = new signUpPaid()
//const loginObj = new loginPage()


// import all data json file from fixtures folder
import signUpData from '../../../fixtures/signUpData.json' //import data file

 

describe ('Test SignUp Flow ' ,()=> {

      beforeEach(() => {

        
  cy.clearCookies();
  cy.clearLocalStorage();
  cy.window().then((win) => {
    win.sessionStorage.clear();
   
  });

  
      cy.log("======= Testing SignUp ======")
      cy.log("======= Open Web application ======")
      cy.visit('/')



      })
      slowCypressDown(300) 

      
      it('TC-01: Create Account with valid data and validate auto verification email with mailslurp', { retries: 2 },() => {
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

       it.skip('TC-01: Create Account with valid data and validate send email page', ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")


      cy.wait(500)
       //  Enter and SAVE Full Name
    const fullName = faker.person.firstName()
           signupObj.enterFullName(fullName)
           cy.wrap(fullName).as('savedFullName')
     
    //  Enter and SAVE Email
      signupObj.enterEmail(fullName)
  
     signupObj.enterPassword(faker.internet.password({ length: 8 }))

       signupObj.clickButton()

       cy.log("======= Verify send email page ======")
    
       signupObj.verifySendEmail()

    //   cy.wait(500)

    //   signupObj.validateDashboard()
       signupObj.verifyLogout()

     
      
    })

       it('TC-02: Verify Resend varification email button', { retries: 2 },()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")


      cy.wait(500)
       //  Enter and SAVE Full Name
    const fullName = faker.person.firstName()
           signupObj.enterFullName(fullName)
           cy.wrap(fullName).as('savedFullName')
     
    //  Enter and SAVE Email
      const email = faker.internet.email()
   signupObj.enterEmail(email)
  
    cy.wrap(email).as('savedEmail')

      
     signupObj.enterPassword(faker.internet.password({ length: 8 }))

       signupObj.clickButton()

       cy.log("======= Verify send email page ======")
    
       signupObj.verifySendEmail()
       signupObj.verifySendEmailButton()
       signupObj.verifyLogout()

     
      
    })




// nagative TC

 it('TC-03: Validate SignUp process with duplicate email',{ retries: 2 }, ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title

       //  Enter and SAVE Full Name
    const fullName = faker.person.firstName()
           signupObj.enterFullName(fullName)
           cy.wrap(fullName).as('savedFullName')
     
    //  Enter and SAVE Email
   
    signupObj.enterDuplicateEmail('qwkhire3@gmail.com')
    

      signupObj.enterPassword(signUpData.password)
    

       signupObj.clickButton()
       cy.wait(300)
        signupObj.validateErrorOnDuplicateEmail()  
       
    })

    // email field with invalud email

 it('TC-04: Validate Email field', { retries: 2 },()=>{

      
   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title

       //  Enter and SAVE Full Name
    const fullName = faker.person.firstName()
           signupObj.enterFullName(fullName)
           cy.wrap(fullName).as('savedFullName')
     

    signupObj.validateEmailField('test')


      signupObj.enterPassword(signUpData.password)
  
       signupObj.clickButton()

      
      

    })

   
    //validate Continuee button on empty fields should be disable
    
    it('TC-05: Validate Continuee Button on Empty Fields',{ retries: 2 }, ()=>{

       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
 
      cy.log("======= Click button wihtout entring any Data ======")
        
       signupObj.clickButton()

      signupObj.validateCreateAccountButtonOnEmptyFields()
    
    })


       it('TC-06: Validate Sign In link', { retries: 2 },()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
        signupObj.validateSigninLink()
      
       
    })

    

       it('TC-07: Validate Continuee with Google Button',{ retries: 2 }, ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
        signupObj.validateWithGoogleButt()
  
      
    })



        it.skip('TC-11: Validate SignUp Paid with Start free Trial button', ()=>{

   
       cy.log("======= Clicking signUp Paid with Start free Trial button ======")
       signUpPaidObj.clickPaidButt()
       cy.log("======= Validate Page title  ======")
       signUpPaidObj.validateStep1()
            cy.log("======= Entring valid Data in all fields ======")

    //  signUpPaidObj.validatePageTitle() //validate Page Title


         //  Enter and SAVE Full Name
    const fullName = faker.person.firstName()
            signUpPaidObj.enterFullName(fullName)
           cy.wrap(fullName).as('savedFullName')
     
    //  Enter and SAVE Email
    const email = faker.internet.email()
    signUpPaidObj.enterEmail(email)
    cy.wrap(email).as('savedEmail')


       
       
        signUpPaidObj.enterPassword('123456')
        signUpPaidObj.clickContunueeButton()
         signUpPaidObj.validateStep2()
         signUpPaidObj.clickContinueeButt()

        signUpPaidObj.validateStep3()
        signUpPaidObj.selectPaid()
        signUpPaidObj.clickGetStartedButt()
        signUpPaidObj.validateDashboard()

      
    })



it('TC-08: Validate invalid Password', { retries: 2 },()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title

     const fullName = faker.person.firstName()
           signupObj.enterFullName(fullName)
           cy.wrap(fullName).as('savedFullName')
     
    //  Enter and SAVE Email
      const email = faker.internet.email()
    signupObj.enterEmail(email)
    cy.wrap(email).as('savedEmail')


  
     signupObj.enterPassword(faker.internet.password({ length: 7 }))
    

       signupObj.clickButton()
        signupObj.validatePassword()
     
 })

 
       
})
