class signUp {


    //Locators

    weblocators={

        getFreeStartedButt: '//a[@class="btn btn-primary"][normalize-space()="Get Started Free"]',
        fullName :'#name',
        email :'#email',
        password:'#password',
        createAccoutnButt :'.button[type="submit"]',
    
        googleSignUp: 'button.login-google-btn',
    
        title : 'div[class="card"] div h1',
        EmptyFieldsMsg : '.text-center.text-red-500.text-xs.font-medium.mb-2',
        }


  //Methords

  validateForgotPw(){

    cy.contains('Forgot password?').click()
    cy.url().should('include' , '/forgot-password')
  }

  validateCreateAccountButtonOnEmptyFields(){

   cy.get(this.weblocators.fullName)
    .invoke('prop', 'validationMessage')
    .should('contain', 'Please fill out this field'); // Or custom HTML5 message

   //.should('be.disabled')
    

  }
  
     enterFullName(FName){
        cy.get(this.weblocators.fullName).clear().type(FName)
                
    }

  validateWithGoogleButt(){

  cy.window().then((win) => {
    cy.stub(win, 'open').as('popup')
  })

  cy.contains('Google')
    .should('be.visible')
    .click()

  cy.get('@popup')
    .should('have.been.calledOnce')

}

     saveEnteredName() {
    return this.elements.FName().invoke('val');
  }

    validatePageTitle(){

        cy.contains('Create Your Account').should('have.text', 'Create Your Account');

    }
enterEmail(emailAddress){
/*
  
  const email = `${Date.now()}@example.com`;

  cy.get(this.weblocators.email)
    .clear()
    .type(fullName + email)

  cy.wrap(fullName + email).as('savedEmail')
  */
  cy.get(this.weblocators.email)
    .clear()
    .type(emailAddress)

}

    verifySendEmailButton(){

      cy.contains('Resend verification email').click()
      cy.wait(300)
      cy.contains('Failed to send verification email. Please try again.').should('not.exist')
    }

    validateTermLink() {

  cy.get(this.weblocators.terms)
    .should('be.visible')
    .invoke('removeAttr', 'target')   // Open in same tab
    .click()

  cy.url({ timeout: 10000 })
    .should('include', '/terms')

  cy.verifyPageIsNotBlank()

}
    
      validatePrivacylink(){

        cy.get(this.weblocators.privacy)
         .should('be.visible')
    .invoke('removeAttr', 'target')   // Open in same tab
    .click()
    
  cy.url({ timeout: 10000 })
   .should('include', '/privacy')

  cy.verifyPageIsNotBlank()


    }


enterDuplicateEmail(email){
cy.get(this.weblocators.email).clear().type(email)

     
}

     validateErrorOnDuplicateEmail(){

     cy.contains('Firebase: Error (auth/email-already-in-use).').should('be.visible')
    }

 
    verifySendEmail(){

      cy.contains('Check your inbox').should('be.visible')
    }


verifyLogout(){

     cy.contains('Sign out and use a different account').click()
}
       saveEnteredEmail() {
    return this.elements.email().invoke('val');
  }

    enterPassword(Password){

        cy.get(this.weblocators.password, { timeout: 20000 }).clear().type(Password)
       
    }

    
    clickButton(){

       cy.contains('Create Account').click()
    }

    validatePassword() {

   cy.contains('Password must be at least 8 characters')
      .should('be.visible')

  }




    validateEmailField(email){
        cy.get(this.weblocators.email, { timeout: 20000 }).scrollIntoView()
  .should('be.visible')
.type(email)
        cy.get(this.weblocators.email, { timeout: 20000 }) .scrollIntoView()
  .should('be.visible')
.then(($input) => {
    expect($input[0].validationMessage, { timeout: 20000 }).to.contain('@')
  })
                
    }

       validateSigninLink(){

        cy.contains('Sign In').click()
        cy.url().should('eq', 'https://flacroncv-web.onrender.com/en/login');

 
                
    }
    validateDashboard(){
        
       cy.get(':nth-child(1) > .text-2xl').should('be.visible')
       // cy.get()
    }


}
export default signUp;