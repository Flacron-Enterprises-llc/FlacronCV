import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'
import logout from '../../pages/logout'

const loginObj = new authPage()
const headerObj = new headerPage()
const logoutObj = new logout()



describe('Test Login Flow ' ,()=>{

      beforeEach(() => {
  
      cy.log("======= Testing SignUp ======")
      cy.log("======= Open Web application ======")
      cy.visit('/')
      })

      
      slowCypressDown(300) 

       it.only('TC-01: Login with valid Email and Password', { retries: 1 },()=>{
     
       cy.log("======= Validate Page title  ======")

       headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

     loginObj.enterValidEmail(signUpData.email)

    loginObj.enterPassword(signUpData.password);
    loginObj.clickButton()
    loginObj.validateDashboard()

   
           logoutObj.logoutMain()
  
    })



// nagative TC

 it('TC-02: Validate Login with invalid email', { retries: 2 },()=>{
 cy.log("======= Clicking Get Start Free button from landing page ======")
     
    cy.log("======= Validate Page title  ======")

       headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')



      cy.log("======= Entring Data ======")
      

     loginObj.enterValidEmail("test@d")

    loginObj.enterPassword(signUpData.password);
    loginObj.clickButton()
    loginObj.validateWrongEmail()

  
  })

   

 it('TC-03: Validate with invalid password', { retries: 2 },()=>{

       
       cy.log("======= Validate Page title  ======")

       headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

     loginObj.enterValidEmail(signUpData.email)
   
    loginObj.enterPassword("testtettt");
     loginObj.clickButton()
 
    loginObj.validateWrongPassword()
   
      
    })



    it('TC-04: validate empty email field error ', { retries: 2 },()=>{

       cy.log("======= Validate Page title  ======")

       headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterPassword("testtettt");
    loginObj.clickButton()
    
    loginObj.validateEmptyEmail()



    })

     
    it('TC-05: validate empty password field error ',{ retries: 2 }, ()=>{

       
       cy.log("======= Validate Page title  ======")

         headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterValidEmail("qwkhire3@gmail.com");
    loginObj.clickButton()
    
        loginObj.validateEmptypPw()



    })


    
    it('TC-06: validate empty password field error ',{ retries: 2 }, ()=>{

       
       cy.log("======= Validate Page title  ======")

         headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterValidEmail("qwkhire3@gmail.com");
    loginObj.clickButton()
    
        loginObj.validateEmptypPw()



    })


    
    it('TC-07: validate empty password field error ',{ retries: 2 }, ()=>{

       
       cy.log("======= Validate Page title  ======")

         headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterValidEmail("qwkhire3@gmail.com");
    loginObj.clickButton()
    
        loginObj.validateEmptypPw()



    })


    
    it('TC-08: validate invalid email and password',{ retries: 2 }, ()=>{

       
       cy.log("======= Validate Page title  ======")

        headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterValidEmail("abd@gmail.com");
     loginObj.enterPassword("testtettt");

    loginObj.clickButton()
    
        loginObj.validateWrongEmailAndPw()



    })


    it('TC-09: validate Forgot password link', { retries: 2 },()=>{
 
       cy.log("======= Validate Page title  ======")

      headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')
       loginObj.validateForgotPw()


    })

       it('TC-10: validate Create Account link', { retries: 2 },()=>{
 
       cy.log("======= Validate Page title  ======")

      headerObj.topMenu.loginButt().click()
       cy.url().should('include', '/login')
       loginObj.validateCreateAccoutnLink()


    })    
      

    })
