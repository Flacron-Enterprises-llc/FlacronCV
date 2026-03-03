import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'

const loginObj = new authPage()
const headerObj = new headerPage()



describe('Test Login Flow ' ,()=>{

      beforeEach(() => {
  
      cy.log("======= Testing SignUp ======")
      cy.log("======= Open Web application ======")
      cy.visit('/')
      })
      slowCypressDown(200) 



       it('Login with valid Email and Password', ()=>{
       cy.log("======= Clicking Get Start Free button from landing page ======")
      // headerObj.loginButton()
       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

     loginObj.enterValidEmail(signUpData.email)

    loginObj.enterPassword(signUpData.password);
    loginObj.clickButton()
    loginObj.validateDashboard()
    loginObj.clickLogout()

    })



// nagative TC

 it('Validate Login with invalid email', ()=>{
 cy.log("======= Clicking Get Start Free button from landing page ======")
     
       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

     loginObj.enterValidEmail("test@tee")

    loginObj.enterPassword(signUpData.password);
    loginObj.clickButton()
    loginObj.validateWrongEmail()

  
  })

   

 it('Validate with invalid password', ()=>{

       
       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

     loginObj.enterValidEmail(signUpData.email)

    loginObj.enterPassword("testtettt");
    loginObj.clickButton()
    
    loginObj.validateWrongPassword()
   
      
    })



    it('validate empty email field error ', ()=>{

       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterPassword("testtettt");
    loginObj.clickButton()
    
    loginObj.validateEmptyEmail()



    })

     
    it('validate empty password field error ', ()=>{

       
       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterValidEmail("qwkhire3@gmail.com");
    loginObj.clickButton()
    
        loginObj.validateEmptypPw()



    })


    
    it('validate invalid email and password', ()=>{

       
       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')


      cy.log("======= Entring Data ======")
      

    loginObj.enterValidEmail("abd@gmail.com");
     loginObj.enterPassword("testtettt");

    loginObj.clickButton()
    
        loginObj.validateWrongEmailAndPw()



    })


    it('validate Forgot password link', ()=>{
 
       cy.log("======= Validate Page title  ======")

       headerObj.loginButton().click()
       cy.url().should('include', '/login')
       loginObj.validateForgotPw()


    })



    
      

    })
