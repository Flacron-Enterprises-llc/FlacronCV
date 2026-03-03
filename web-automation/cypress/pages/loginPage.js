class authPage {


  
    weblocators={

       
        email :'#email',
        pw: '#password',
        button:'button[type="submit"]',
        title:'.login-subtitle',
        logout: 'button:has-text("Logout")',
       
     
          

    }

  
  validateDashboard(){

    cy.scrollTo('top')
    cy.contains('Welcome').should('be.visible')
    
  }

  validateForgotPw(){

    cy.contains('Forgot password?').click()
    cy.verifyPageIsNotBlank()
  }

    
  clickLogout(){

    cy.contains('Logout').click()
    

  }


     enterValidEmail(Email){
        cy.get(this.weblocators.email).type(Email)
                
    }

    validateWindowTitle(){

        cy.get(this.weblocators.title).should('have.text', 'Sign in to your FlacronCV account');

    }

    enterPassword(password){

         cy.get(this.weblocators.pw).type(password)
    }


    clickButton(){

        cy.get(this.weblocators.button).click()
    }


    validateEmailField(email){
        cy.get(this.weblocators.email).type(email)
        cy.get(this.weblocators.email).then(($input) => {
    expect($input[0].validationMessage).to.contain('@')
  })
                
    }

     validateEmptyEmail(){
  
      cy.get(this.weblocators.email)
      .invoke('prop', 'validationMessage')
    .should('contain', 'Please fill out this field'); 
       
       

       
    }

      validateEmptypPw(){

        
 cy.get(this.weblocators.pw)
      .invoke('prop', 'validationMessage')
    .should('contain', 'Please fill out this field'); 
       
       
    }



     validateWrongEmail(){

       
       cy.wait(300)

        cy.contains('Please enter a valid email address')
      .should('be.visible')
   
       
    }

      validateWrongPassword(){

        
         cy.contains('Invalid credentials. Please check your email and password.')
      .should('be.visible')
       
    }

          validateWrongEmailAndPw(){

        
         cy.contains('Invalid credentials. Please check your email and password.')
      .should('be.visible')
       
    }


/*
  

  emailField() {
    return cy.get('input[type="email"]')
  }

  passwordField() {
    return cy.get('input[type="password"]')
  }

  submitButton() {
    return cy.get('button[type="submit"]')
  }

  createFreeAccount(email, password) {
    this.emailField().type(email)
    this.passwordField().type(password)
    this.submitButton().click()
  }

  */
}

export default authPage
