

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
  
      cy.log("======= Testing SignUp ======")
      cy.log("======= Open Web application ======")
      cy.visit('/')
      })
      slowCypressDown(200) 

       it('TC-01: Create Account with valid data and validate dashboard', ()=>{

   
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
    const email = faker.internet.email()
    signupObj.enterEmail(email)
    cy.wrap(email).as('savedEmail')

      signupObj.enterPassword(signUpData.password)
     // signupObj.enterPassword(faker.internet.password({ length: 8 }))

     signupObj.clickCheckbox()
       signupObj.clickButton()

       cy.log("======= Selecting Country and Language on 2nd page ======")
    
   
   
      signupObj.selectRandomCountry();
     signupObj.validateSelectedCountry()
      signupObj.selectCountyandLangauge()
      cy.wait(300)

       signupObj.validateDashboard('@savedFullName');

       logoutObj.logout()
      
    })



// nagative TC

       it('TC-02: Validate Trems checkbox', ()=>{

   
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
    const email = faker.internet.email()
    signupObj.enterEmail(email)
    cy.wrap(email).as('savedEmail')

      signupObj.enterPassword(signUpData.password)
    
    // signupObj.clickCheckbox()
       signupObj.clickButton()
       signupObj.validateErrornUncheckTermBox()

      
    })



 it('TC-03: Validate SignUp process with duplicate email', ()=>{

   
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
   
    signupObj.enterDuplicateEmail('testuser_1772077397225@example.com')
    

      signupObj.enterPassword(signUpData.password)
    
     signupObj.clickCheckbox()
       signupObj.clickButton()
       cy.wait(300)
        signupObj.validateErrorOnDuplicateEmail()  
    })

    // email field with invalud email

 it('TC-04: Validate Email field', ()=>{

      
   
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
   
     signupObj.clickCheckbox()
       signupObj.clickButton()

      

    })

    //validate password and confirm password fields with different data 

 it('TC-05: Validate error message on Providing different password in password in confirm password fields', ()=>{

      
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
     
 
    //  Validate Email Field
   
    const email = faker.internet.email()
    signupObj.enterEmail(email)
 
      signupObj.ValidatePasswordandConfirmPasswordChange(signUpData.password)

    
    })

    //validate Continuee button on empty fields should be disable
    
    it('TC-06: Validate Continuee Button on Empty Fields', ()=>{

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


       it('TC-07: Validate Sign In link', ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
        signupObj.validateSigninLink()
      
    })

    

       it('TC-08: Validate Continuee with Google Button', ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
        signupObj.validateWithGoogleButt()
      
    })


       it('TC-09: Validate Terms of service link', ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
        signupObj.validateTermLink()
      
    })

           it('TC-10: Validate Privacy Policy link', ()=>{

   
       cy.log("======= Clicking Get Start Free button from landing page ======")
       landingObj.getStartFreeButt()
       cy.log("======= Validate Page title  ======")
       signupObj.validatePageTitle()

            cy.log("======= Entring valid Data in all fields ======")

      signupObj.validatePageTitle() //validate Page Title
        signupObj.validatePrivacylink()
      
    })


        it('TC-11: Validate SignUp Paid with Start free Trial button', ()=>{

   
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




       
})